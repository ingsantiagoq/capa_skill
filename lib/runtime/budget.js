'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_BUDGET = {
  max_minutes: 5,
  max_tool_calls: 8,
  max_bash_commands: 4,
  max_file_reads: 5,
  max_file_edits: 2,
  max_files_touched: 2,
  max_git_diff_lines: 200,
  allow_auto_fix: false,
};

function readConfig(root) {
  const configPath = path.join(root, '.capa', 'config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    return { _error: error.message };
  }
}

function getBudget(root) {
  const config = readConfig(root);
  const budget = { ...DEFAULT_BUDGET, ...(config.defaultBudget || {}) };
  return { budget, configError: config._error || null };
}

function lines(root) {
  const { budget, configError } = getBudget(root);
  const out = [];
  if (configError) out.push(`config warning: ${configError}`);
  out.push(`max_minutes: ${budget.max_minutes}`);
  out.push(`max_tool_calls: ${budget.max_tool_calls}`);
  out.push(`max_bash_commands: ${budget.max_bash_commands}`);
  out.push(`max_file_reads: ${budget.max_file_reads}`);
  out.push(`max_file_edits: ${budget.max_file_edits}`);
  out.push(`max_files_touched: ${budget.max_files_touched}`);
  out.push(`max_git_diff_lines: ${budget.max_git_diff_lines}`);
  out.push(`allow_auto_fix: ${budget.allow_auto_fix ? 'true' : 'false'}`);
  return out;
}

module.exports = { DEFAULT_BUDGET, getBudget, lines };
