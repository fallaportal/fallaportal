#!/usr/bin/env python3
"""WS-PREVISIO: detector d'ingressos i despeses recurrents a partir dels extractes (banc) dels exercicis de l'export.

Només LLIG l'export .xlsx; no modifica res. Reutilitza les partides i les exclusions de `previsio_f0_perfil.py`
(consums falles.app, traspassos, recàrregues TPV duplicades, apunts imputats a l'altre exercici).

Ús (des de la carpeta del projecte):
    python -I tools/previsio_recurrents.py "C:/ruta/export.xlsx"

Escriu `<export>_recurrents_<data>.xlsx` al costat de l'export (fora del repo; xifres reals: no el pugis enlloc).

Base: només els comptes de banc (+ TPV). L'efectiu del 25/26 no es va registrar (PLA_PREVISIO_TRESORERIA §10.1): els pagaments en efectiu
d'aquell any no hi són, per això aquest informe no diu res del bar, el casal o les festes pagades en efectiu; això es completa a mà.

Per a cada partida i sentit (ingrés / despesa): imports per mes al 25/26 i al 26/27 fins avui, quants mesos hi ha moviments, l'import mitjà
d'un mes actiu i una classificació:
  · mensual      moviments a 8 o més mesos del 25/26 (o a tots els mesos transcorreguts del 26/27, si n'hi ha 3 o més)
  · periòdica    2–7 mesos, amb separació regular (cada 3 mesos, remeses…) o repetida als dos exercicis
  · puntual      un sol mes: un contracte, un event o una compra
Proposa, per a cada recurrent, el calendari dels mesos que queden de l'exercici en curs: és el que es revisa amb la tresoreria.
"""
import os
import sys
import re
import datetime as dt
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from f0_perfil_dades import read_tabs, num  # noqa: E402
import previsio_f0_perfil as pf  # noqa: E402

from openpyxl import Workbook  # noqa: E402
from openpyxl.styles import Font, PatternFill  # noqa: E402


def moviments_de(d, af):
    ini, fi = pf.limits(af)
    seg = '%02d/%02d' % (int(af[:2]) + 1, int(af[3:]) + 1)
    bancs_codi = {b['codi'] for b in d['bancs'] if b.get('tipus') == 'bank'} | {'TPV'}
    movs = [m for m in d['moviments'] if m.get('anyFiscal') == af]
    for m in movs:
        m['imp'] = num(m['import']) or 0.0
        m['_data'] = pf.parse_data(m['data'])
        m.setdefault('traspas', '')
    traspassos = pf.detecta_traspassos(movs, bancs_codi)
    res = []
    for m in movs:
        c = m['concepte'].upper()
        if m['via'] == 'app' or m['id'] in traspassos or m['via'] not in bancs_codi:
            continue
        if m['fontImport'].startswith('fallesapp') and re.search(r'REC.RREGA TPV', c):
            continue
        if m['fontImport'].startswith('xls_') and m['_data'] and m['_data'] > fi:
            continue
        m['_mes'] = pf.mes_de(m['_data'], ini, fi)
        m['_partida'], m['_nat'] = pf.partida(m)
        res.append(m)
    return res


def classifica(mesos25, mesos26, transcorreguts26):
    n25, n26 = len(mesos25), len(mesos26)
    if n25 >= 8 or (transcorreguts26 >= 3 and n26 >= transcorreguts26):
        return 'mensual'
    if n25 + n26 == 0:
        return '—'
    idx = sorted(pf.MESOS.index(x) for x in mesos25 if x in pf.MESOS)
    regular = len(idx) >= 3 and len({b - a for a, b in zip(idx, idx[1:])}) == 1
    if (n25 >= 2 and regular) or (n25 and n26):
        return 'periòdica'
    if n25 >= 2 or n26 >= 2:
        return 'periòdica'
    return 'puntual'


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]
    d, _, _ = read_tabs(path)
    m25 = moviments_de(d, '25/26')
    m26 = moviments_de(d, '26/27')
    avui = dt.date.today()
    ini26, _ = pf.limits('26/27')
    transcorreguts = max(0, (avui.year - ini26.year) * 12 + avui.month - ini26.month + 1)
    mes_avui = pf.MESOS[(avui.month - 4) % 12]

    def per_partida(movs):
        t = defaultdict(lambda: defaultdict(float))
        for m in movs:
            if m['_mes'] == pf.FORA:
                continue
            t[(m['tipus'], m['_partida'], m['_nat'])][m['_mes']] += m['imp']
        return t
    p25, p26 = per_partida(m25), per_partida(m26)
    claus = sorted(set(p25) | set(p26), key=lambda k: (k[0] != 'ing', -(sum(p25[k].values()) + sum(p26[k].values()))))

    files = []
    for k in claus:
        tipus, nom, nat = k
        a, b = p25.get(k, {}), p26.get(k, {})
        cl = classifica(a, b, transcorreguts)
        actius = [v for v in list(a.values()) if v] or [v for v in b.values() if v]
        mitjana = sum(actius) / len(actius) if actius else 0.0
        # mesos que queden de l'exercici en curs, segons el 25/26 (mateixos mesos) o la mitjana si és mensual
        queden = pf.MESOS[(pf.MESOS.index(mes_avui) + 1):] if mes_avui in pf.MESOS else []
        prev = {}
        for ms in queden:
            if cl == 'mensual':
                prev[ms] = round(mitjana, 2)
            elif cl == 'periòdica' and a.get(ms):
                prev[ms] = round(a[ms], 2)
        files.append(dict(tipus=tipus, nom=nom, nat=nat, cl=cl, a=a, b=b, t25=sum(a.values()), t26=sum(b.values()),
                          n25=len(a), n26=len(b), mitjana=mitjana, prev=prev))

    wb = Workbook()
    cap = PatternFill('solid', fgColor='DDE4EE')
    eur = '#,##0.00;[Red]-#,##0.00'
    ws = wb.active
    ws.title = 'Recurrents'
    ws.append(['Sentit', 'Partida', 'Naturalesa proposada', 'Classe', 'Mesos 25/26', 'Total 25/26', 'Mesos 26/27', 'Total 26/27 fins avui',
               'Mitjana d\'un mes actiu', 'Previsió mesos que queden (segons el 25/26)', 'Decisió'])
    for c in ws[1]:
        c.font, c.fill = Font(bold=True), cap
    for f in files:
        ws.append(['Ingrés' if f['tipus'] == 'ing' else 'Despesa', f['nom'], f['nat'], f['cl'], f['n25'], round(f['t25'], 2), f['n26'],
                   round(f['t26'], 2), round(f['mitjana'], 2), round(sum(f['prev'].values()), 2), ''])
    for row in ws.iter_rows(min_row=2):
        for c in row:
            if isinstance(c.value, float):
                c.number_format = eur
    for col, w in zip('ABCDEFGHIJK', (9, 58, 16, 11, 11, 14, 11, 18, 18, 24, 30)):
        ws.column_dimensions[col].width = w

    ws2 = wb.create_sheet('Per mes')
    ws2.append(['Sentit', 'Partida', 'Classe', 'Exercici'] + pf.MESOS)
    for c in ws2[1]:
        c.font, c.fill = Font(bold=True), cap
    for f in files:
        for etiqueta, dades in (('25/26', f['a']), ('26/27', f['b'])):
            if dades:
                ws2.append(['Ingrés' if f['tipus'] == 'ing' else 'Despesa', f['nom'], f['cl'], etiqueta] +
                           [round(dades.get(ms, 0.0), 2) or None for ms in pf.MESOS])
    for row in ws2.iter_rows(min_row=2, min_col=5):
        for c in row:
            if isinstance(c.value, float):
                c.number_format = eur
    ws2.column_dimensions['B'].width = 58

    ws3 = wb.create_sheet('Pla base')
    ws3.append(['Mes', 'Ingressos recurrents', 'Despeses recurrents', 'Resultat'])
    for c in ws3[1]:
        c.font, c.fill = Font(bold=True), cap
    for ms in (pf.MESOS[(pf.MESOS.index(mes_avui) + 1):] if mes_avui in pf.MESOS else []):
        i = sum(f['prev'].get(ms, 0) for f in files if f['tipus'] == 'ing')
        g = sum(f['prev'].get(ms, 0) for f in files if f['tipus'] == 'gast')
        ws3.append([ms, round(i, 2), round(g, 2), round(i - g, 2)])
    for row in ws3.iter_rows(min_row=2, min_col=2):
        for c in row:
            c.number_format = eur

    sortida = '%s_recurrents_%s.xlsx' % (os.path.splitext(path)[0], dt.date.today().strftime('%Y%m%d'))
    wb.save(sortida)
    print('Informe:', sortida)
    print('Mes en curs: %s · mesos transcorreguts del 26/27: %d' % (mes_avui, transcorreguts))
    for f in files:
        if f['cl'] == 'mensual' or f['t25'] + f['t26'] >= 5000:
            print('%-8s %-9s %-62s 25/26 %9.0f (%2d m)  26/27 %9.0f (%d m)  mitjana %8.0f' % (
                'Ingrés' if f['tipus'] == 'ing' else 'Despesa', f['cl'], f['nom'][:62], f['t25'], f['n25'], f['t26'], f['n26'], f['mitjana']))


if __name__ == '__main__':
    main()
