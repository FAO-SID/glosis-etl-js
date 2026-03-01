const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('/Volumes/LACIE/glosis-etl-js/public/glosis_template_v6.xlsx');
  for (const name of ['Site Data', 'Plot Data', 'Profile Data', 'Metadata']) {
    const ws = wb.getWorksheet(name);
    if (!ws) { console.log(name, 'NOT FOUND'); continue; }
    console.log('=== ' + name + ' (rows:' + ws.rowCount + ') ===');
    for (let r = 1; r <= Math.min(4, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col <= 15) cells.push('C' + col + '=' + String(cell.value || '').substring(0,30));
      });
      console.log('  Row' + r + ': ' + cells.join(', '));
    }
  }
})();
