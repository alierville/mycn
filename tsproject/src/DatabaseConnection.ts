import { Pool } from "./Pool"
import { DatabaseConnection, PreparedStatement } from "./transactions-definitions";
import { BasicDatabaseConnection, BasicPreparedStatement } from "./driver-definitions";

export function toDatabaseConnection(cn: BasicDatabaseConnection, pool: Pool, inTrans = false): DatabaseConnection {
  let closed = false
  let endedTrans = false
  let thisObj: DatabaseConnection = {
    exec: (sql: string, params?: any[]) => cn.exec(sql, params),
    all: (sql: string, params?: any[]) => cn.all(sql, params),
    prepare: async (sql: string, params?: any[]) => toPreparedStatement(await cn.prepare(sql, params)),
    execScript: (sql: string) => cn.execScript(sql),
    singleRow: async (sql: string, params?: any[]) => toSingleRow(await cn.all(sql, params)),
    singleValue: async (sql: string, params?: any[]) => toSingleValue(await cn.all(sql, params)),
    get inTransaction() {
      return inTrans
    },
    commit: () => endOfTransaction("commit"),
    rollback: () => endOfTransaction("rollback"),
    beginTransaction: async (force = false) => {
      if (closed)
        throw new Error(`Invalid call to 'beginTransaction', the connection is closed`)
      if (inTrans)
        throw new Error("Cannot open a transaction in a transaction")
      let newCn = await pool.grab()
      await newCn.exec("begin")
      return toDatabaseConnection(cn, pool, true)
    },
    close: async () => {
      if (closed)
        throw new Error(`Invalid call to 'close', the connection is already closed`)
      let promise: Promise<void> | undefined
      if (inTrans)
        promise = thisObj.rollback()
      closed = true
      if (promise)
        await promise
      if (!endedTrans && pool.singleUse === cn)
        await pool.close()
    }
  }
  return thisObj

  async function endOfTransaction(method) {
    if (closed)
      throw new Error(`Invalid call to '${method}', the connection is closed`)
    if (!inTrans || cn === pool.singleUse)
      throw new Error(`Cannot '${method}', not in a transaction`)
    inTrans = false
    endedTrans = true
    await cn.exec(method)
    pool.release(cn)
    cn = pool.singleUse
  }
}

function toPreparedStatement(ps: BasicPreparedStatement): PreparedStatement {
  return {
    exec: (params?: any[]) => ps.exec(params),
    all: (params?: any[]) => ps.all(params),
    fetch: () => ps.fetch(),
    bind: (nb: number, value: any) => ps.bind(nb, value),
    unbindAll: () => ps.unbindAll(),
    finalize: () => ps.finalize(),
    singleRow: async (params?: any[]) => toSingleRow(await ps.all(params)),
    singleValue: async (params?: any[]) => toSingleValue(await ps.all(params))
  }
}

function toSingleRow(rows: any[]) {
  if (rows.length !== 1) {
    if (rows.length === 0)
      return
    throw new Error(`Cannot fetch one value, row count: ${rows.length}`)
  }
  return rows[0]
}

function toSingleValue(rows: any[]) {
  let row = toSingleRow(rows)
  if (row === undefined)
    return
  let columns = Object.keys(row)
  if (columns.length !== 1)
    throw new Error(`Cannot fetch one value, column count: ${columns.length}`)
  return row[columns[0]]
}
