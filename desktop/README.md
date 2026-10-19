# RAIS CRM Desktop

Thin Electron shell around your own CRM URL — tabs with separate session partitions, same role as Close’s desktop wrapper.

## Run

```bash
cd desktop
npm install
RAIS_CRM_URL=http://localhost:3000/liste npm start
```

On Windows PowerShell:

```powershell
$env:RAIS_CRM_URL = "http://localhost:3000/liste"
npm start
```

Point `RAIS_CRM_URL` at production when ready.
