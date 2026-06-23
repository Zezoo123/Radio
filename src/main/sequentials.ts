import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { Sequential } from './core/sequential/types'

/** Persists sequentials (definitions + their rotation queues) as JSON. */
class SequentialStore {
  private filePath(): string {
    return join(app.getPath('userData'), 'sequentials.json')
  }

  async load(): Promise<Sequential[]> {
    try {
      const list = JSON.parse(await readFile(this.filePath(), 'utf-8')) as Sequential[]
      return Array.isArray(list) ? list.map(normalize) : []
    } catch {
      return []
    }
  }

  async save(list: Sequential[]): Promise<void> {
    await writeFile(this.filePath(), JSON.stringify(list, null, 2), 'utf-8')
  }

  /** Create or update a sequential by id. Editing resets its queue. */
  async upsert(seq: Sequential): Promise<Sequential[]> {
    const list = await this.load()
    const next: Sequential = { ...normalize(seq), queue: [] }
    const i = list.findIndex((s) => s.id === seq.id)
    if (i >= 0) list[i] = next
    else list.push(next)
    await this.save(list)
    return list
  }

  async remove(id: string): Promise<Sequential[]> {
    const list = (await this.load()).filter((s) => s.id !== id)
    await this.save(list)
    return list
  }
}

function normalize(seq: Sequential): Sequential {
  return { ...seq, queue: Array.isArray(seq.queue) ? seq.queue : [] }
}

export const sequentialStore = new SequentialStore()
