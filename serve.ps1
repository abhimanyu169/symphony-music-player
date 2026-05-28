$port = 5500
try {
    $listener = [System.Net.HttpListener]::new()
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    $listener.Start()
    Write-Host "Symphony server running at http://127.0.0.1:$port" -ForegroundColor Green
} catch {
    Write-Host "Port $port busy, trying 5501..." -ForegroundColor Yellow
    $port = 5501
    $listener = [System.Net.HttpListener]::new()
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    $listener.Start()
    Write-Host "Symphony server running at http://127.0.0.1:$port" -ForegroundColor Green
}

$root = "c:\Users\abhim\Antigravity"
while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        $lp = $req.Url.LocalPath
        if ($lp -eq '/') { $lp = '/index.html' }
        $fp = $root + $lp.Replace('/', '\')
        if (Test-Path $fp -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($fp)
            $ext = [System.IO.Path]::GetExtension($fp)
            $mime = switch ($ext) {
                '.html' { 'text/html; charset=utf-8' }
                '.css'  { 'text/css; charset=utf-8' }
                '.js'   { 'application/javascript; charset=utf-8' }
                '.json' { 'application/json' }
                default { 'application/octet-stream' }
            }
            $res.ContentType = $mime
            $res.ContentLength64 = $bytes.Length
            $res.StatusCode = 200
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
            $res.ContentLength64 = $msg.Length
            $res.OutputStream.Write($msg, 0, $msg.Length)
        }
        $res.OutputStream.Close()
    } catch {
        # Ignore individual request errors and keep listening
    }
}
