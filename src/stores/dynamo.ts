import { DynamoDBClient, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import type { CounterEntry, CounterRow, CounterStore } from '../server/types'

export interface DynamoStoreOptions {
  /** Table name. Defaults to the `ENNI_TABLE` env var. */
  table?: string
  /** Bring your own client (region, credentials, endpoint). */
  client?: DynamoDBClient
  /**
   * Multi-site prefix for the partition key (design-for-it hook: one
   * table can hold several sites as `site#YYYY-MM-DD` partitions).
   */
  site?: string
  /** Rows expire this many days after first write. Default 400. */
  ttlDays?: number
}

/**
 * Counter storage: one item per (day, metric, value), incremented with
 * `ADD` so writes need no reads. Schema: pk `[site#]YYYY-MM-DD`,
 * sk `metric#value`, n (count), exp (TTL epoch seconds).
 */
export class DynamoStore implements CounterStore {
  private client: DynamoDBClient
  private table: string
  private site: string
  private ttlDays: number

  constructor(opts: DynamoStoreOptions = {}) {
    const table = opts.table ?? process.env.ENNI_TABLE
    if (!table) throw new Error('DynamoStore: set the table option or the ENNI_TABLE env var')
    this.table = table
    this.client = opts.client ?? new DynamoDBClient({})
    this.site = opts.site ?? ''
    this.ttlDays = opts.ttlDays ?? 400
  }

  private pk(day: string): string {
    return this.site ? `${this.site}#${day}` : day
  }

  async add(day: string, entries: CounterEntry[]): Promise<void> {
    const exp = Math.floor(Date.now() / 1000) + this.ttlDays * 86_400
    await Promise.all(
      entries.map((e) =>
        this.client.send(
          new UpdateItemCommand({
            TableName: this.table,
            Key: { pk: { S: this.pk(day) }, sk: { S: `${e.metric}#${e.value}` } },
            UpdateExpression: 'ADD #n :one SET #exp = if_not_exists(#exp, :exp)',
            ExpressionAttributeNames: { '#n': 'n', '#exp': 'exp' },
            ExpressionAttributeValues: { ':one': { N: '1' }, ':exp': { N: String(exp) } },
          }),
        ),
      ),
    )
  }

  async query(days: string[]): Promise<CounterRow[]> {
    const perDay = await Promise.all(days.map((d) => this.queryDay(d)))
    return perDay.flat()
  }

  private async queryDay(day: string): Promise<CounterRow[]> {
    const out: CounterRow[] = []
    let lastKey: Record<string, unknown> | undefined
    do {
      const res = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: '#p = :p',
          ExpressionAttributeNames: { '#p': 'pk' },
          ExpressionAttributeValues: { ':p': { S: this.pk(day) } },
          ExclusiveStartKey: lastKey as never,
        }),
      )
      for (const item of res.Items ?? []) {
        const sk = item.sk?.S ?? ''
        const count = Number(item.n?.N ?? 0)
        const i = sk.indexOf('#')
        if (i > 0 && count > 0)
          out.push({ day, metric: sk.slice(0, i), value: sk.slice(i + 1), count })
      }
      lastKey = res.LastEvaluatedKey
    } while (lastKey)
    return out
  }
}
