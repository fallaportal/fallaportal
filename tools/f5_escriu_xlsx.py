#!/usr/bin/env python3
"""Fase 5 (WS-SUPABASE): escriu un .xlsx amb el format de pestanyes del Google Sheet a partir d'un JSON.

Entrada (JSON): {"tabs": [{"name": "01 Moviments", "headers": ["id", ...], "rows": [{"id": "m1", ...}, ...]}, ...]}
Només ESCRIU el fitxer de sortida; mai llig ni toca cap altre fitxer. L'usa tools/supabase_exporta_xlsx.mjs.
Ús: python -I tools/f5_escriu_xlsx.py <entrada.json> <sortida.xlsx>
"""
import json
import sys

from openpyxl import Workbook


def main():
    if len(sys.argv) != 3:
        sys.exit('Ús: python -I tools/f5_escriu_xlsx.py <entrada.json> <sortida.xlsx>')
    with open(sys.argv[1], encoding='utf-8') as f:
        dades = json.load(f)
    wb = Workbook()
    wb.remove(wb.active)
    for t in dades['tabs']:
        ws = wb.create_sheet(t['name'][:31])
        ws.append(t['headers'])
        for r in t['rows']:
            # Tot com a text, com escrivia l'app al full (valueInputOption RAW): cap conversió de dates ni de nombres.
            ws.append(['' if r.get(h) is None else str(r.get(h)) for h in t['headers']])
    wb.save(sys.argv[2])
    print('ok', sum(len(t['rows']) for t in dades['tabs']), 'files,', len(dades['tabs']), 'pestanyes')


if __name__ == '__main__':
    main()
