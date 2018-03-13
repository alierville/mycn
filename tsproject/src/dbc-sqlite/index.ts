import { BasicDatabaseConnection, BasicExecResult, BasicPreparedStatement } from "../driver-definitions"
import { open, Database, Statement } from "sqlite"

export interface SqliteConnectionOptions {
  fileName: string
  mode?: number
  verbose?: boolean
}

export function newConnectionProvider(options: SqliteConnectionOptions): () => Promise<BasicDatabaseConnection> {
  return async () => {
    let db = await open(options.fileName, { mode: options.mode, verbose: options.verbose })
    return toBasicDatabaseConnection(db)
  }
}

function toBasicDatabaseConnection(db: Database): BasicDatabaseConnection {
  let cursor: InMemoryCursor | undefined
  return {
    exec: async (sql: string, params?: any[]) => toBasicExecResult(await db.run(sql, ...params)),
    all: (sql: string, params?: any[]) => db.all(sql, ...params),
    prepare: async (sql: string, params?: any[]) => toBasicPreparedStatement(await db.prepare(sql, ...params)),
    execScript: async (sql: string) => {
      await db.exec(sql)
    },
    close: async () => {
      cursor = undefined
      await db.close()
    }
  }
}

function toBasicExecResult(st: Statement): BasicExecResult {
  return {
    affectedRows: st.changes,
    insertedId: st.lastID
  }
}

function toBasicPreparedStatement(st: Statement): BasicPreparedStatement {
  let manualBound = false
  let curParams: any[] | undefined
  let cursor: InMemoryCursor | undefined
  return {
    exec: async (params?: any[]) => {
      curParams = params
      manualBound = false
      return toBasicExecResult(await st.run(...params))
    },
    all: (params?: any[]) => {
      curParams = params
      manualBound = false
      return st.all(...params)
    },
    fetch: async () => {
      if (!cursor)
        cursor = makeInMemoryCursor(await st.all(...(curParams || [])))
      return cursor.fetch()
    },
    bind: async (nb: number, value: any) => {
      if (!manualBound) {
        manualBound = true
        curParams = []
      }
      curParams[nb - 1] = value
    },
    unbindAll: async () => {
      manualBound = false
      curParams = undefined
    },
    finalize: () => st.finalize()
  }
}

interface InMemoryCursor {
  fetch(): any | undefined
}

function makeInMemoryCursor(rows: any[]): InMemoryCursor {
  let currentIndex = -1
  return {
    fetch: () => rows[++currentIndex]
  }
}
