import { readFile, writeFile } from 'node:fs/promises'
import type { Sequential } from './core/sequential/types'
import { stationFile, stationFileEnsured } from './station'

/** Persists sequentials (definitions + their rotation queues) as JSON, per station. */
class SequentialStore {
  async load(): Promise<Sequential[]> {
    try {
      const list = JSON.parse(await readFile(stationFile('sequentials.json'), 'utf-8')) as Sequential[]
      return Array.isArray(list) ? list.map(normalize) : []
    } catch (err) {
      // Only a missing file means "first run"; other errors must surface so
      // a failed read can't be persisted back as an empty list by upsert/remove.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }

  async save(list: Sequential[]): Promise<void> {
    await writeFile(
      await stationFileEnsured('sequentials.json'),
      JSON.stringify(list, null, 2),
      'utf-8'
    )
  }

  /** Create or update a sequential by id. Editing resets its queue + history. */
  async upsert(seq: Sequential): Promise<Sequential[]> {
    const list = await this.load()
    const next: Sequential = { ...normalize(seq), queue: [], last: undefined }
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
