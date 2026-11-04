// Certificat d'antiguitat d'un faller/a (Word, 1 pagina A4). Eina local, fora de l'app publicada.
//
// Us:
//   Faller/a en actiu:
//     node certificat_faller.mjs --nom "Macarena Gimeno Giménez" --cens-falla 591 --cens-jcf 626167 --carrec vocal ^
//          --alta 01/03/2023 --anys "2023, 2024, 2025, 2026 i 2027" --sortida ..\Certificat_Macarena_Gimeno.docx
//   Faller/a de baixa (passat: "va formar part ... fins al <baixa>"): afegeix --baixa DD/MM/AAAA
// Obligatoris: --nom --alta --sortida. Opcionals (si no es donen, la frase corresponent no apareix):
//   --cens-falla --cens-jcf --carrec --anys (anys als censos de la JCF)
//   --cens-anys "2012 i 2013, el 139; 2014 i 2015, el 140" (numero de cens de la falla per any, text lliure)
//   --comissio infantil (defecte) | major · --data 04/11/2026 (defecte: avui) · --falla-num 23801
// Despres, per a signar amb Autofirma: powershell -File certificat_pdf.ps1 -Docx <fitxer.docx>
//
// D'on surten les dades: l'alta i la baixa, de Altes.xlsx / Baixes.xlsx (export del programa de cens de
// la falla); els anys, el cens JCF, la comissio i el carrec, de la "Fitxa de Faller" de la JCF (PDF);
// el numero de cens de la falla, de la fitxa o del Cens. Els certificats son dades personals:
// Certificat_* esta al .gitignore.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, BorderStyle,
  Table, TableRow, TableCell, WidthType,
} from 'docx';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const oblig = ['nom', 'alta', 'sortida'];
const falten = oblig.filter((k) => !args[k]);
if (falten.length) { console.error('Falten opcions: ' + falten.map((k) => '--' + k).join(', ')); process.exit(1); }

const MESOS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];
function parsa(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) { console.error('Data no valida (DD/MM/AAAA): ' + s); process.exit(1); }
  return { d: +m[1], m: +m[2], y: +m[3] };
}
const llarga = ({ d, m, y }) => `${d} de ${MESOS[m - 1]} de ${y}`;
// Elisio davant de so vocalic: l'1, l'8, l'11 (la resta: el 2, el 15, el 18...)
const elidit = (d) => [1, 8, 11].includes(d);
const desDe = (d) => (elidit(d) ? 'des de l’' : 'des del ');
const finsA = (d) => (elidit(d) ? 'fins a l’' : 'fins al ');

const avui = new Date();
const data = args.data ? parsa(args.data) : { d: avui.getDate(), m: avui.getMonth() + 1, y: avui.getFullYear() };
const alta = parsa(args.alta);
const baixa = args.baixa ? parsa(args.baixa) : null;
const comissio = args.comissio || 'infantil';
const carrec = args.carrec;
const fallaNum = args['falla-num'] || '23801';

const FONT = 'Georgia';
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 24, ...o });
const para = (children, o = {}) => new Paragraph({ children, spacing: { after: 280, line: 380 }, alignment: AlignmentType.JUSTIFIED, ...o });

const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: none, bottom: none, left: none, right: none };
const sigCell = (title) => new TableCell({
  width: { size: 4500, type: WidthType.DXA },
  borders: noBorders,
  children: [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1000 }, children: [run(title, { bold: true })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 4 } },
      children: [run('Signatura i nom', { size: 20, color: '555555' })],
    }),
  ],
});

// Primer paragraf: "Que <nom>[, amb numero de cens X en aquesta falla][ i numero de cens Y en la JCF], es/va ser membre ..."
const cens = [];
if (args['cens-falla']) cens.push(run(', amb número de cens '), run(args['cens-falla'], { bold: true }), run(' en aquesta falla'));
if (args['cens-jcf']) {
  cens.push(run(args['cens-falla'] ? ' i número de cens ' : ', amb número de cens '), run(args['cens-jcf'], { bold: true }), run(' en la Junta Central Fallera'));
}
const paraMembre = para([
  run('Que '), run(args.nom, { bold: true }), ...cens,
  run(`, ${baixa ? 'va ser' : 'és'} membre de la comissió ${comissio} de la Falla Portal de la Valldigna${carrec ? `, amb el càrrec de ${carrec}` : ''}.`),
]);

// Segon paragraf: periode i, si es coneixen, els anys als censos de la JCF
const periode = baixa
  ? [
    run(`Que va formar part d’aquesta falla ${desDe(alta.d)}`), run(llarga(alta), { bold: true }),
    run(` ${finsA(baixa.d)}`), run(llarga(baixa), { bold: true }), run(', data en què va causar baixa'),
  ]
  : [
    run(`Que consta d’alta en aquesta falla ${desDe(alta.d)}`), run(llarga(alta), { bold: true }),
    run(' i hi ha format part de manera ininterrompuda fins a l’actualitat'),
  ];
const paraPeriode = para([
  ...periode,
  ...(args.anys ? [run(', figurant als censos de la Junta Central Fallera dels anys '), run(args.anys, { bold: true })] : []),
  // Numero de cens de la falla per any (text lliure), per a qui no apareix a la JCF
  ...(args['cens-anys'] ? [run(', figurant al cens de la falla amb els números següents: '), run(args['cens-anys'], { bold: true })] : []),
  run('.'),
]);

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 24 } } } },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1701 } } },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 120 },
        children: [new ImageRun({ type: 'png', data: fs.readFileSync(path.join(aqui, 'assets', 'escut_falla.png')), transformation: { width: 80, height: 120 } })],
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [run('FALLA PORTAL DE LA VALLDIGNA', { bold: true, size: 30 })] }),
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 480 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '444444', space: 8 } },
        children: [run('Tavernes de la Valldigna', { size: 22, color: '555555' })],
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 480 }, children: [run('CERTIFICAT', { bold: true, size: 36, characterSpacing: 60 })] }),

      para([run(`Els sotasignats, en qualitat de representants de la Falla Portal de la Valldigna, de Tavernes de la Valldigna, amb el número ${fallaNum} de la Junta Central Fallera,`)]),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 280 }, children: [run('CERTIFIQUEN', { bold: true, size: 26, characterSpacing: 40 })] }),
      paraMembre,
      paraPeriode,
      para([run(`I perquè així conste, als efectes oportuns, expedeixen el present certificat a Tavernes de la Valldigna, a ${llarga(data)}.`)], { spacing: { before: 280, after: 1500, line: 380 } }),

      new Table({
        width: { size: 9000, type: WidthType.DXA },
        columnWidths: [4500, 4500],
        borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
        rows: [new TableRow({ cantSplit: true, children: [sigCell('El/la President/a'), sigCell('El/la Secretari/a')] })],
      }),
    ],
  }],
});

fs.writeFileSync(args.sortida, await Packer.toBuffer(doc));
console.log('Escrit: ' + args.sortida);
