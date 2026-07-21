Set objShell = CreateObject("WScript.Shell")
strFolder = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
objShell.CurrentDirectory = strFolder & "..\"
objShell.Run "cmd /c node scripts\backup-turso.mjs >> backups\backup.log 2>&1", 0, True
