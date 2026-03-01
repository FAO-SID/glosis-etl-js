const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('public/glosis_template_v6.xlsx');
  for (const name of ['Element Data', 'Specimen Data', 'Procedures', 'Original Data']) {
    const ws = wb.getWorksheet(name);
    if (!ws) { console.log(name + ' - NOT FOUND'); continue; }
    console.log('=== ' + name + ' (rows:' + ws.rowCount + ', cols:' + ws.columnCount + ') ===');
    for (let r = 1; r <= Math.min(3, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col <= 20) cells.push('C' + col + '=' + String(cell.value || '').substring(0, 40));
      });
      console.log('  Row' + r + ': ' + cells.join(', '));
    }
  }
})();
