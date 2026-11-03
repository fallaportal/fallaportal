#!/usr/bin/env python3
"""WS-PREVISIO, Fase 0: perfil d'un exercici tancat com a base del pressupost i de la previsió de tresoreria.

Només LLIG l'export .xlsx del full; no modifica res i no es connecta a cap servei.

Ús (des de la carpeta del projecte):
    python -I tools/previsio_f0_perfil.py "C:/ruta/export.xlsx" [exercici]      (per defecte 25/26)

Escriu `<export>_perfil_previsio_<exercici>_<data>.xlsx` al costat de l'export (fora del repo; el .gitignore també
l'exclou). Conté xifres reals: no el pugis enlloc.

Fulls de l'informe:
  - Resum: totals, exclusions i quadrament de cada compte (saldo inicial + moviments = saldo inicial del següent).
  - Partides per mes: ingressos i despeses per partida i mes, amb la naturalesa proposada.
  - Delegacions per mes: el mateix per delegació (la base del calendari quan una línia de pressupost no té mes).
  - Apunts a revisar: el que s'ha exclòs i el que pot distorsionar el patró, amb el motiu.
  - Naturalesa: partida -> fixa / variable / extraordinaria, amb una columna buida per a la decisió.

Exclusions (vegeu PLA_PREVISIO_TRESORERIA.md, Fase 0):
  - `via:'app'` (consums de falles.app: només estadístics).
  - Traspassos entre comptes: marca `traspas` o parella detectada (concepte de traspàs, mateix import, sentit contrari, un
    altre compte, 20 dies com a màxim). No són ingrés ni despesa, però sí que entren al quadrament dels comptes.
  - Recàrregues TPV de falles.app al banc (A-27): ja entren com a «Ingrés APP».
  - Apunts d'extracte amb data de l'exercici següent (A-10): es van passar al seu exercici (D-029).
"""
import os
import re
import sys
import datetime as dt
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from f0_perfil_dades import read_tabs, num  # noqa: E402

from openpyxl import Workbook  # noqa: E402
from openpyxl.styles import Font, PatternFill  # noqa: E402

MESOS = ['Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Des', 'Gen', 'Feb', 'Mar']
FORA = 'Fora'
LLINDAR_GRAN = 2500
RE_TRASPAS = re.compile(r'TRASP|ENTRE BANCS')

# (partida, tipus, naturalesa proposada, condició). La primera que casa guanya.
# c = concepte en majúscules; m = moviment.
PARTIDES = [
    ('Bonificació moneders falles.app (no és efectiu)', 'gast', 'variable', lambda c, m: m['via'] == 'Virtual'),
    ('Quotes (remeses)', 'ing', 'fixa', lambda c, m: 'QUOTES DE FALLERS' in c),
    ('Quotes (pagaments individuals)', 'ing', 'fixa', lambda c, m: re.search(r'\bQUOTES?\b', c)),
    ('Devolucions de quotes', 'gast', 'fixa', lambda c, m: re.search(r'QUOTES', c)),
    ('Loteria', None, 'fixa', lambda c, m: 'LOTERI' in c),
    ('Recàrregues falles.app en efectiu', 'ing', 'variable',
     lambda c, m: m['via'] == 'Efectiu' and m['fontImport'].startswith('fallesapp')),
    ('Recàrregues falles.app amb targeta (Ingrés APP)', 'ing', 'variable', lambda c, m: re.search(r'INGR.S APP', c)),
    ('Vendes amb targeta als events (TPV)', 'ing', 'variable', lambda c, m: re.search(r'VENDA TPV|TBD ON|^ON \d', c)),
    ('Vendes en efectiu als events (caixes)', 'ing', 'variable',
     lambda c, m: m['fontImport'] in ('tancament', 'retirada_caixa')),
    ('Devolucions de moneders falles.app', 'gast', 'variable', lambda c, m: re.search(r'DEVOLUCI.*FALLES', c)),
    ('Assegurances (ingrés)', 'ing', 'extraordinaria', lambda c, m: 'ASSEGURAN' in c),
    ('50è aniversari', None, 'extraordinaria', lambda c, m: m['delegacioId'] == '0506'),
    ('Orquestres i música', 'gast', 'variable', lambda c, m: re.search(r'ORQUESTR|XARANGA|BANDA DE M|SONORITZ|M.SICA', c)),
    ('Beguda i menjar', 'gast', 'variable', lambda c, m: re.search(r'BEGUDA|OLIVES|VARIANTS|^G.L\b|MENJAR|CATERING', c)),
    ('Monument gran', 'gast', 'variable', lambda c, m: m['delegacioId'] == '0601'),
    ('Monument infantil', 'gast', 'variable', lambda c, m: m['delegacioId'] == '0602'),
    ('Llibret', 'gast', 'variable', lambda c, m: m['delegacioId'] == '0303' or 'LLIBRET' in c),
    ('Llum', 'gast', 'fixa', lambda c, m: re.search(r'\bLLUM\b|ELECTRIC|IBERDROLA|ENDESA', c)),
    ('Aigua', 'gast', 'fixa', lambda c, m: re.search(r'AIGUA|AGUAS', c)),
    ('Assegurances', 'gast', 'fixa', lambda c, m: 'ASSEGURAN' in c or 'SEGURO' in c),
    ('Impostos', 'gast', 'fixa', lambda c, m: 'IMPOST' in c),
    ('Nòmines', 'gast', 'fixa', lambda c, m: re.search(r'N.MINES|NOMINA', c)),
    ('Comissions bancàries i TPV', None, 'fixa',
     lambda c, m: re.search(r'COMISSI|CUOTA BANC|MANTENIMENT TP|ALTA TPV|SERV\.REC|TBD|MULTIDIVA|ALQUILER TPV|LLOGUER TPV', c)),
    ('App i polseres (falles.app)', 'gast', 'fixa', lambda c, m: re.search(r'PULSERES|POLSERES', c)),
    ('Telecomunicacions i serveis web', 'gast', 'fixa', lambda c, m: re.search(r'WIFI|IONOS|TEL.FON|INTERNET', c)),
    ('Lloguers', 'gast', 'fixa', lambda c, m: re.search(r'LLOGUER|ALQUILER', c)),
    ('Casal (neteja i manteniment)', 'gast', 'fixa', lambda c, m: m['delegacioId'] == '0704'),
    ('Carpa i muntatges', 'gast', 'variable', lambda c, m: m['delegacioId'] == '0701'),
    ('Magatzem i materials', 'gast', 'variable', lambda c, m: m['delegacioId'] == '0702'),
    ('Actes oficials (proclamació, presentació, fallers d\'honor, indumentària)', 'gast', 'variable',
     lambda c, m: m['delegacioId'][:2] == '05'),
    ('Infantil', None, 'variable', lambda c, m: m['delegacioId'] == '0304'),
    ('Pirotècnia', 'gast', 'variable', lambda c, m: m['delegacioId'] == '0705'),
]


def parse_data(s):
    s = (s or '').strip()
    for fmt in ('%d/%m/%Y', '%Y-%m-%d'):
        try:
            return dt.datetime.strptime(s[:10], fmt).date()
        except ValueError:
            pass
    return None


def limits(af):
    a = 2000 + int(af[:2])
    return dt.date(a, 4, 1), dt.date(a + 1, 3, 31)


def mes_de(data, ini, fi):
    if data is None or data < ini or data > fi:
        return FORA
    return MESOS[(data.month - 4) % 12]


def partida(m):
    c = m['concepte'].upper().strip()
    for nom, tipus, nat, cond in PARTIDES:
        if tipus and tipus != m['tipus']:
            continue
        if cond(c, m):
            return nom, nat
    if m['tipus'] == 'ing':
        return 'Altres ingressos · ' + m['delegacioNom'], 'variable'
    return 'Altres despeses · ' + m['delegacioNom'], 'variable'


def detecta_traspassos(movs, bancs_codi):
    """Ids dels traspassos: la marca, o una parella amb concepte de traspàs en un costat."""
    ids = {m['id'] for m in movs if m.get('traspas') == 'true'}
    banc = [m for m in movs if m['via'] in bancs_codi and m['_data']]
    for a in banc:
        if a['id'] in ids or not RE_TRASPAS.search(a['concepte'].upper()):
            continue
        for b in banc:
            if (b['id'] not in ids and b['id'] != a['id'] and b['via'] != a['via'] and b['tipus'] != a['tipus']
                    and abs(b['imp'] - a['imp']) < 0.005 and abs((b['_data'] - a['_data']).days) <= 20):
                ids.update((a['id'], b['id']))
                break
    return ids


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]
    af = sys.argv[2] if len(sys.argv) > 2 else '25/26'
    ini, fi = limits(af)
    seg = '%02d/%02d' % (int(af[:2]) + 1, int(af[3:]) + 1)
    d, _, _ = read_tabs(path)

    bancs = {b['codi']: b for b in d['bancs']}
    codi_per_id = {b['id']: b['codi'] for b in d['bancs']}
    bancs_codi = {b['codi'] for b in d['bancs'] if b.get('tipus') == 'bank'}
    movs = [m for m in d['moviments'] if m.get('anyFiscal') == af]
    for m in movs:
        m['imp'] = num(m['import']) or 0.0
        m['_data'] = parse_data(m['data'])
        m.setdefault('traspas', '')

    revisar = []   # (motiu, moviment)
    traspassos = detecta_traspassos(movs, bancs_codi)
    valids, compten = [], []   # valids: entren al quadrament dels comptes; compten: ingressos i despeses
    for m in movs:
        c = m['concepte'].upper()
        if m['via'] == 'app':
            continue
        if m['fontImport'].startswith('fallesapp') and m['via'] != 'Efectiu' and re.search(r'REC.RREGA TPV', c):
            revisar.append(('Exclòs: recàrrega TPV duplicada (A-27)', m))
            continue
        if m['fontImport'].startswith('xls_') and m['_data'] and m['_data'] > fi:
            revisar.append(('Exclòs: apunt de l\'extracte del %s imputat al %s (A-10, D-029)' % (seg, af), m))
            continue
        valids.append(m)
        if m['id'] in traspassos:
            revisar.append(('Exclòs: traspàs entre comptes', m))
            continue
        compten.append(m)
        m['_mes'] = mes_de(m['_data'], ini, fi)
        m['_partida'], m['_nat'] = partida(m)
        if m['_mes'] == FORA:
            revisar.append(('Data fora de l\'exercici (compta al %s)' % af, m))
        if m['via'] == 'Virtual':
            revisar.append(('No és efectiu: compta al resultat, no a la tresoreria', m))
        elif m['tipus'] == 'gast' and m['imp'] >= LLINDAR_GRAN:
            revisar.append(('Despesa >= %s €: recurrent o puntual?' % LLINDAR_GRAN, m))
        if m['tipus'] == 'ing' and m['imp'] >= 1000 and (m['_partida'].startswith('Altres ') or m['_nat'] == 'extraordinaria'):
            revisar.append(('Ingrés no habitual (>= 1.000 €): extraordinari?', m))
        elif m['_partida'].startswith('Altres ') and m['imp'] >= 500:
            revisar.append(('Partida sense classificar (>= 500 €)', m))

    # Quadrament dels comptes: saldo inicial + moviments vàlids (traspassos inclosos) = saldo inicial del següent
    saldos = {(s['bancId'], s['anyFiscal']): num(s['saldoInicial']) for s in d['saldos']}
    quadra = []
    for bid, codi in codi_per_id.items():
        net = sum(m['imp'] if m['tipus'] == 'ing' else -m['imp'] for m in valids if m['via'] == codi)
        si, ss = saldos.get((bid, af)), saldos.get((bid, seg))
        quadra.append((codi, si, net, (si + net) if si is not None else None, ss,
                       (si + net - ss) if si is not None and ss is not None else None))
    ef_codi = next((b['codi'] for b in d['bancs'] if b.get('tipus') == 'cash'), 'Efectiu')
    ef_in = sum(m['imp'] for m in valids if m['via'] == ef_codi and m['tipus'] == 'ing')
    ef_out = sum(m['imp'] for m in valids if m['via'] == ef_codi and m['tipus'] == 'gast')
    ef_seg = saldos.get((next((k for k, v in codi_per_id.items() if v == ef_codi), ''), seg))

    # Agregats
    def agrega(clau):
        t = defaultdict(lambda: defaultdict(float))
        for m in compten:
            t[(m['tipus'],) + clau(m)][m['_mes']] += m['imp']
        return t
    per_partida = agrega(lambda m: (m['_partida'], m['_nat']))
    per_deleg = agrega(lambda m: (m['delegacioId'], m['delegacioNom']))
    tot = {t: sum(m['imp'] for m in compten if m['tipus'] == t) for t in ('ing', 'gast')}
    virtual = sum(m['imp'] for m in compten if m['via'] == 'Virtual')

    # ---- xlsx
    wb = Workbook()
    neg = Font(bold=True)
    cap = PatternFill('solid', fgColor='DDE4EE')
    eur = '#,##0.00;[Red]-#,##0.00'

    def capcalera(ws, cols):
        ws.append(cols)
        for c in ws[ws.max_row]:
            c.font, c.fill = neg, cap

    def format_eur(ws, des_de_col):
        for row in ws.iter_rows(min_row=2, min_col=des_de_col):
            for c in row:
                if isinstance(c.value, float):
                    c.number_format = eur

    ws = wb.active
    ws.title = 'Resum'
    ws.append(['Perfil de l\'exercici %s com a base de la previsió (WS-PREVISIO, Fase 0)' % af])
    ws['A1'].font = Font(bold=True, size=13)
    ws.append(['Export', os.path.basename(path)])
    ws.append(['Generat', dt.date.today().strftime('%d/%m/%Y')])
    ws.append([])
    ws.append(['Ingressos (sense consums app ni traspassos)', round(tot['ing'], 2)])
    ws.append(['Despeses (sense traspassos)', round(tot['gast'], 2)])
    ws.append(['   de les quals no són efectiu (Virtual)', round(virtual, 2)])
    ws.append(['Resultat segons l\'app', round(tot['ing'] - tot['gast'], 2)])
    ws.append([])
    capcalera(ws, ['Compte', 'Saldo inicial %s' % af, 'Moviments (net)', 'Saldo final calculat',
                   'Saldo inicial %s' % seg, 'Diferència'])
    for q in quadra:
        ws.append(list(q))
    ws.append([])
    ws.append(['Efectiu: entrades registrades', round(ef_in, 2)])
    ws.append(['Efectiu: sortides registrades', round(ef_out, 2)])
    ws.append(['Efectiu: saldo inicial del %s' % seg, ef_seg])
    if ef_seg is not None:
        ws.append(['Pagaments en efectiu NO registrats (mínim, si l\'efectiu a l\'inici era 0)',
                   round(ef_in - ef_out - ef_seg, 2)])
    ws.append([])
    ws.append(['Exclusions i avisos: full «Apunts a revisar».'])
    ws.column_dimensions['A'].width = 70
    for col in 'BCDEF':
        ws.column_dimensions[col].width = 20
    format_eur(ws, 2)

    for nom, dades, etiq in (('Partides per mes', per_partida, ['Partida', 'Naturalesa proposada']),
                             ('Delegacions per mes', per_deleg, ['Delegació', 'Nom'])):
        ws = wb.create_sheet(nom)
        capcalera(ws, ['Tipus'] + etiq + MESOS + [FORA, 'Total', '% del total del tipus'])
        for (tipus, a, b), mesos in sorted(dades.items(), key=lambda kv: (kv[0][0] != 'ing', -sum(kv[1].values()))):
            vals = [round(mesos.get(k, 0.0), 2) for k in MESOS + [FORA]]
            total = sum(vals)
            ws.append(['Ingrés' if tipus == 'ing' else 'Despesa', a, b] + vals +
                      [round(total, 2), round(100 * total / tot[tipus], 1) if tot[tipus] else 0])
        for tipus in ('ing', 'gast'):
            vals = [round(sum(m['imp'] for m in compten if m['tipus'] == tipus and m['_mes'] == k), 2)
                    for k in MESOS + [FORA]]
            ws.append(['Total ' + ('ingressos' if tipus == 'ing' else 'despeses'), '', ''] + vals + [round(sum(vals), 2)])
            for c in ws[ws.max_row]:
                c.font = neg
        ws.column_dimensions['B'].width = 48
        ws.column_dimensions['C'].width = 26 if nom.startswith('Deleg') else 18
        format_eur(ws, 4)

    ws = wb.create_sheet('Apunts a revisar')
    capcalera(ws, ['Motiu', 'Data', 'Compte', 'Tipus', 'Import', 'Delegació', 'Event', 'Concepte', 'Id'])
    for motiu, m in sorted(revisar, key=lambda r: (r[0], r[1]['_data'] or dt.date.min)):
        ws.append([motiu, m['data'], m['via'], m['tipus'], round(m['imp'], 2), m['delegacioNom'], m['eventNom'],
                   m['concepte'], m['id']])
    ws.column_dimensions['A'].width = 52
    ws.column_dimensions['H'].width = 50
    format_eur(ws, 5)

    ws = wb.create_sheet('Naturalesa')
    capcalera(ws, ['Partida', 'Tipus', 'Naturalesa proposada', 'Total %s' % af, 'Decisió (fixa / variable / extraordinaria)'])
    for (tipus, p, nat), mesos in sorted(per_partida.items(), key=lambda kv: (kv[0][0] != 'ing', kv[0][2], kv[0][1])):
        ws.append([p, 'Ingrés' if tipus == 'ing' else 'Despesa', nat, round(sum(mesos.values()), 2), ''])
    ws.column_dimensions['A'].width = 60
    ws.column_dimensions['C'].width = 22
    ws.column_dimensions['E'].width = 40
    format_eur(ws, 4)

    base = os.path.splitext(path)[0]
    out = '%s_perfil_previsio_%s_%s.xlsx' % (base, af.replace('/', '-'), dt.date.today().strftime('%Y%m%d'))
    wb.save(out)

    print('Exercici %s: %d moviments, %d compten, %d traspassos, %d a revisar' %
          (af, len(movs), len(compten), len(traspassos), len(revisar)))
    print('Ingressos %.2f · despeses %.2f (Virtual %.2f) · resultat app %.2f' %
          (tot['ing'], tot['gast'], virtual, tot['ing'] - tot['gast']))
    for q in quadra:
        print('  %-8s inicial %s net %.2f final %s següent %s dif %s' % (q[0], q[1], q[2], q[3], q[4], q[5]))
    if ef_seg is not None:
        print('Efectiu no registrat (mínim): %.2f' % (ef_in - ef_out - ef_seg))
    print('Informe:', out)


if __name__ == '__main__':
    main()
