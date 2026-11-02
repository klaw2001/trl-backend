import { Response } from 'express'
import ExcelJS from 'exceljs'
import moment from 'moment'

export interface ExportColumn {
    key: string
    header: string
    width?: number
}

function formatCell(value: any) {
    if (value === null || value === undefined) {
        return ''
    }
    if (value instanceof Date) {
        return moment(value).format('YYYY-MM-DD HH:mm')
    }
    return value
}

function csvEscape(value: any) {
    const text = String(formatCell(value))
    // Prefix formula-like values so spreadsheets do not execute them
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export async function sendExport(
    res: Response,
    format: 'csv' | 'xlsx',
    fileName: string,
    columns: ExportColumn[],
    rows: Record<string, any>[]
) {
    const stamp = moment().format('YYYYMMDD-HHmm')

    if (format === 'csv') {
        const lines = [
            columns.map((c) => csvEscape(c.header)).join(','),
            ...rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(','))
        ]

        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}-${stamp}.csv"`)
        return res.send('﻿' + lines.join('\n'))
    }

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(fileName.slice(0, 31))

    sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }))
    rows.forEach((row) => {
        const formatted: Record<string, any> = {}
        columns.forEach((c) => (formatted[c.key] = formatCell(row[c.key])))
        sheet.addRow(formatted)
    })
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    const buffer = await workbook.xlsx.writeBuffer()

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}-${stamp}.xlsx"`)
    return res.send(Buffer.from(buffer))
}
