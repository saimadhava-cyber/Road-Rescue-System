const WDIOReporter = require('@wdio/reporter').default;
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

class ExcelReporter extends WDIOReporter {
    constructor(options) {
        super(options);
        
        const testResultsDir = path.join(process.cwd(), 'Test Results');
        options = Object.assign({
            outputDir: testResultsDir,
            filename: process.env.REPORT_FILENAME ? `${process.env.REPORT_FILENAME}.xlsx` : 'Automation_Test_Report.xlsx'
        }, options);
        
        this.options = options;
        this.results = [];
        this.startTime = new Date();
        
        ['Excel', 'HTML', 'Summary', 'Logs', 'Screenshots'].forEach(dir => {
            const dirPath = path.join(this.options.outputDir, dir);
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        });
    }

    onTestPass(test) {
        this.results.push({
            name: test.title,
            parent: test.parent,
            status: 'Passed',
            duration: test._duration,
            error: ''
        });
    }

    onTestFail(test) {
        this.results.push({
            name: test.title,
            parent: test.parent,
            status: 'Failed',
            duration: test._duration,
            error: test.error ? test.error.message : 'Unknown error'
        });
    }

    onTestSkip(test) {
        this.results.push({
            name: test.title,
            parent: test.parent,
            status: 'Skipped',
            duration: 0,
            error: ''
        });
    }

    async onRunnerEnd() {
        console.log(`Generating Excel report with ${this.results.length} test results...`);
        
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Appium E2E Framework';
        workbook.created = new Date();
        
        const sheet = workbook.addWorksheet('Test Analysis');
        
        // Define columns
        sheet.columns = [
            { header: 'Test Suite', key: 'parent', width: 25 },
            { header: 'Test Case', key: 'name', width: 40 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Duration (ms)', key: 'duration', width: 15 },
            { header: 'Error Details', key: 'error', width: 50 }
        ];
        
        // Style headers
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' }
        };
        
        // Add data
        this.results.forEach(result => {
            const row = sheet.addRow(result);
            // Color code based on status
            if (result.status === 'Passed') {
                row.getCell('status').font = { color: { argb: 'FF00B050' }, bold: true };
            } else if (result.status === 'Failed') {
                row.getCell('status').font = { color: { argb: 'FFFF0000' }, bold: true };
            } else {
                row.getCell('status').font = { color: { argb: 'FFFFA500' }, bold: true };
            }
        });
        
        const filePath = path.join(this.options.outputDir, 'Excel', this.options.filename);
        await workbook.xlsx.writeFile(filePath);

        // Generate HTML Report
        const passed = this.results.filter(r => r.status === 'Passed').length;
        const failed = this.results.filter(r => r.status === 'Failed').length;
        const skipped = this.results.filter(r => r.status === 'Skipped').length;
        const total = this.results.length;
        const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
        
        const htmlPath = path.join(this.options.outputDir, 'HTML', 'execution-report.html');
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Appium Test Execution Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                .summary { background: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
                th { background: #4CAF50; color: white; }
                .Passed { color: green; font-weight: bold; }
                .Failed { color: red; font-weight: bold; }
                .Skipped { color: orange; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Appium Android Test Execution Report</h1>
            <div class="summary">
                <p><strong>Total Tests:</strong> ${total}</p>
                <p><strong>Passed:</strong> ${passed}</p>
                <p><strong>Failed:</strong> ${failed}</p>
                <p><strong>Skipped:</strong> ${skipped}</p>
                <p><strong>Pass Rate:</strong> ${passRate}%</p>
            </div>
            <table>
                <tr><th>S.No</th><th>Suite</th><th>Test</th><th>Status</th><th>Duration (ms)</th><th>Error</th></tr>
                ${this.results.map((r, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${r.parent}</td>
                    <td>${r.name}</td>
                    <td class="${r.status}">${r.status}</td>
                    <td>${r.duration}</td>
                    <td>${r.error || '-'}</td>
                </tr>
                `).join('')}
            </table>
        </body>
        </html>
        `;
        fs.writeFileSync(htmlPath, htmlContent);

        // Generate Markdown Summary
        const mdPath = path.join(this.options.outputDir, 'Summary', 'summary.md');
        const failedTests = this.results.filter(r => r.status === 'Failed');
        const failedSection = failedTests.length > 0 
            ? failedTests.map(r => `- **${r.name}**\n  Reason: ${r.error}`).join('\n')
            : 'No failed tests! 🎉';
            
        const repoName = process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[1] : 'repository-name';
        const owner = process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[0] : 'github-username';
            
        const mdContent = `
# Android Appium Test Summary

**Build Number:** ${process.env.GITHUB_RUN_NUMBER || 'Local'}
**Execution Date:** ${new Date().toISOString()}

**Total Tests:** ${total}
**Passed:** ${passed}
**Failed:** ${failed}
**Pass Rate:** ${passRate}%

**Report URL:**
https://${owner}.github.io/${repoName}/reports/latest/execution-report.html

### Failed Tests:
${failedSection}
        `;
        fs.writeFileSync(mdPath, mdContent.trim());

        console.log(`Excel report successfully generated at: ${filePath}`);
        console.log(`HTML report successfully generated at: ${htmlPath}`);
        console.log(`Markdown summary successfully generated at: ${mdPath}`);
    }
}

module.exports = ExcelReporter;
