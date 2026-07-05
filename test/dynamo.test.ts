import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { describe, expect, it } from 'vitest'
import { DynamoStore } from '../src/stores/dynamo'

type Sent = UpdateItemCommand | QueryCommand

function fakeClient(onSend: (cmd: Sent) => unknown) {
  const sent: Sent[] = []
  const client = {
    send: async (cmd: Sent) => {
      sent.push(cmd)
      return onSend(cmd)
    },
  } as unknown as DynamoDBClient
  return { client, sent }
}

describe('DynamoStore', () => {
  it('requires a table name', () => {
    const prev = process.env.ENNI_TABLE
    delete process.env.ENNI_TABLE
    try {
      expect(() => new DynamoStore()).toThrow(/ENNI_TABLE/)
    } finally {
      if (prev !== undefined) process.env.ENNI_TABLE = prev
    }
  })

  it('increments with ADD and sets TTL only on first write', async () => {
    const { client, sent } = fakeClient(() => ({}))
    const store = new DynamoStore({ table: 't', client, ttlDays: 400 })
    await store.add('2026-07-05', [
      { metric: 'page', value: '/a' },
      { metric: 'country', value: 'IN' },
    ])
    expect(sent).toHaveLength(2)
    const cmd = sent[0] as UpdateItemCommand
    expect(cmd.input).toMatchObject({
      TableName: 't',
      Key: { pk: { S: '2026-07-05' }, sk: { S: 'page#/a' } },
      UpdateExpression: 'ADD #n :one SET #exp = if_not_exists(#exp, :exp)',
    })
    const ttl = Number((cmd.input.ExpressionAttributeValues as never as Record<string, { N: string }>)[':exp']!.N)
    const days = (ttl - Date.now() / 1000) / 86_400
    expect(days).toBeGreaterThan(399)
    expect(days).toBeLessThan(401)
  })

  it('prefixes the partition key for multi-site tables', async () => {
    const { client, sent } = fakeClient(() => ({}))
    const store = new DynamoStore({ table: 't', client, site: 'docs' })
    await store.add('2026-07-05', [{ metric: 'page', value: '/' }])
    expect((sent[0] as UpdateItemCommand).input.Key).toEqual({
      pk: { S: 'docs#2026-07-05' },
      sk: { S: 'page#/' },
    })
  })

  it('queries each day and follows pagination', async () => {
    let call = 0
    const { client } = fakeClient((cmd) => {
      if (!(cmd instanceof QueryCommand)) throw new Error('unexpected')
      call++
      if (call === 1)
        return {
          Items: [{ sk: { S: 'page#/a' }, n: { N: '3' } }],
          LastEvaluatedKey: { pk: { S: 'x' } },
        }
      return { Items: [{ sk: { S: 'flow#/a → /b' }, n: { N: '2' } }] }
    })
    const store = new DynamoStore({ table: 't', client })
    const rows = await store.query(['2026-07-05'])
    expect(rows).toEqual([
      { day: '2026-07-05', metric: 'page', value: '/a', count: 3 },
      { day: '2026-07-05', metric: 'flow', value: '/a → /b', count: 2 },
    ])
  })

  it('splits sort keys on the first hash only', async () => {
    const { client } = fakeClient(() => ({
      Items: [{ sk: { S: 'evt:dl#/files/report#2024.pdf' }, n: { N: '1' } }],
    }))
    const store = new DynamoStore({ table: 't', client })
    const rows = await store.query(['2026-07-05'])
    expect(rows[0]).toMatchObject({ metric: 'evt:dl', value: '/files/report#2024.pdf' })
  })
})
