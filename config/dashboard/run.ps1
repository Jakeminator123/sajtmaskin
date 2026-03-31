# UTF-8 för Python och konsol (åäö). app.py startar Streamlit via subprocess — samma som `streamlit run app.py`.
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
Set-Location $PSScriptRoot
python -m pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
python -X utf8 app.py
exit $LASTEXITCODE
