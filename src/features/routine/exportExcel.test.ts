import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { sampleSchool } from '../../engine/sample'
import { generateRoutine } from '../../engine/schedule'
import { buildRoutineWorkbook } from './exportExcel'

describe('Excel export', () => {
  it('writes a readable workbook with a sheet per class and per teacher', async () => {
    const data = sampleSchool()
    const routine = generateRoutine(data, { seed: 1, maxIterations: 20_000 })
    const wb = await buildRoutineWorkbook(data, routine)

    // Round-trip through a real .xlsx file to make sure Excel could open it.
    const buffer = await wb.xlsx.writeBuffer()
    const back = new ExcelJS.Workbook()
    await back.xlsx.load(buffer as ArrayBuffer)

    const names = back.worksheets.map((w) => w.name)
    expect(names.slice(0, 2)).toEqual(['Overview', 'Workload'])
    expect(names).toContain('Class 5A')
    expect(names).toContain('Class 11 Sci')
    expect(names).toContain('Ananya Sen')
    expect(names).toHaveLength(2 + data.classes.length + data.teachers.length)

    // Class 5A, Monday period 1 holds the same subject and teacher as the routine.
    const ws = back.getWorksheet('Class 5A')!
    const first = routine.grid['c-5A'][0]!
    const text = JSON.stringify(ws.getCell(4, 2).value)
    expect(text).toContain(data.subjects.find((s) => s.id === first.subjectId)!.name)
    expect(text).toContain(data.teachers.find((t) => t.id === first.teacherId)!.name)
    expect(ws.getCell(3, 6).value).toBe('Lunch') // lunch after period 4

    // Workload totals add up to every period placed.
    const wl = back.getWorksheet('Workload')!
    const weekCol = data.settings.dayNames.length + 2
    let total = 0
    for (let r = 4; r < 4 + data.teachers.length; r++) total += Number(wl.getCell(r, weekCol).value)
    expect(total).toBe(routine.stats.lessons)
  }, 30_000)

  it('leaves the end of a shorter day blank', async () => {
    const data = sampleSchool()
    data.settings.shortDays = { Sat: 4 }
    const routine = generateRoutine(data, { seed: 1, maxIterations: 20_000 })
    const wb = await buildRoutineWorkbook(data, routine)
    const ws = wb.getWorksheet('Class 5A')!
    const sat = 4 + 5 // header rows, then Mon..Sat
    expect(ws.getCell(sat, 1).value).toBe('Sat')
    expect(JSON.stringify(ws.getCell(sat, 2).value)).not.toBe('null') // period 1 is taught or free
    expect(ws.getCell(sat, 7).value).toBeNull() // period 5 (after the lunch column) does not happen
  }, 30_000)
})
