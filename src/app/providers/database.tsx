import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  assertStorageAvailable,
  DATABASE_NAME,
  getDatabase,
  type TouchlineDatabase,
} from '../../data/db'
import { databaseUnavailable, loadingCampaign } from '../copy'

const DatabaseContext = createContext<TouchlineDatabase | null>(null)

export function DatabaseProvider({
  name = DATABASE_NAME,
  children,
}: {
  name?: string
  children: ReactNode
}) {
  const [state, setState] = useState<{
    name: string
    database: TouchlineDatabase
  } | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let active = true
    async function connect() {
      try {
        assertStorageAvailable(globalThis.indexedDB)
        const database = getDatabase(name)
        await database.open()
        if (active) setState({ name, database })
      } catch {
        if (active) setUnavailable(true)
      }
    }
    void connect()
    return () => {
      active = false
    }
  }, [name])
  if (unavailable) return <p>{databaseUnavailable}</p>
  if (!state || state.name !== name) return <p>{loadingCampaign}</p>
  return (
    <DatabaseContext.Provider value={state.database}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase(): TouchlineDatabase {
  const database = useContext(DatabaseContext)
  if (!database) throw new Error('DatabaseProvider is missing.')
  return database
}
