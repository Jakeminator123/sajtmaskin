# UTF-8 för Python och konsol (åäö). Detta är nu en legacy-wrapper som startar den
# konsoliderade backoffice-appen via `config/dashboard/app.py`.
# Ytterligare argument skickas till Streamlit efter `app.py`, t.ex.:
#   .\run.ps1 --server.port 8502
# Efter start: öppna LLM-fas-vyn direkt med query-param (byt port vid behov):
#   http://127.0.0.1:8501/?nav=llm
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
Set-Location $PSScriptRoot
python -m pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($args.Count -gt 0) {
  python -X utf8 app.py @args
} else {
  python -X utf8 app.py
}
exit $LASTEXITCODE
