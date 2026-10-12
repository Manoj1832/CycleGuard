/**
 * CycleGuard Backend — CSV Parser Utility
 * Safe, zero-dependency CSV reader and parser for demo and schedule fixtures.
 */

const fs = require('fs');

/**
 * Parse raw CSV string into an array of objects.
 * Handles quoted values, commas, and line breaks.
 * @param {string} csvText
 * @returns {Array<object>}
 */
function parseCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];

  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Parse a single CSV line into an array of strings.
 * @param {string} line
 * @returns {Array<string>}
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Load and parse a CSV file from disk.
 * @param {string} filePath
 * @returns {Array<object>}
 */
function loadCsvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`[CSV] File not found: ${filePath}`);
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return parseCsv(content);
  } catch (err) {
    console.error(`[CSV] Error reading file ${filePath}:`, err.message);
    return [];
  }
}

module.exports = {
  parseCsv,
  loadCsvFile,
};
