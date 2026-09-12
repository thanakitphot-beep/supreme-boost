$ErrorActionPreference = 'Stop'
$configPath = Join-Path $env:USERPROFILE '.gemini/config/mcp_config.json'
$serverPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'mcp/indicator-server.js'
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (!(Test-Path -LiteralPath $serverPath)) { throw 'MCP server file missing' }
$config = if (Test-Path -LiteralPath $configPath) { Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable } else { @{} }
if (!$config.ContainsKey('mcpServers')) { $config['mcpServers'] = @{} }
if (Test-Path -LiteralPath $configPath) { Copy-Item -LiteralPath $configPath -Destination ($configPath + '.indicator-backup-' + (Get-Date -Format 'yyyyMMddHHmmss')) }
$config['mcpServers']['indicator'] = @{ command = $nodePath; args = @($serverPath) }
New-Item -ItemType Directory -Path (Split-Path $configPath -Parent) -Force | Out-Null
$config | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
Write-Output 'Configured indicator MCP; existing servers preserved. Refresh Manage MCP Servers in Antigravity.'
