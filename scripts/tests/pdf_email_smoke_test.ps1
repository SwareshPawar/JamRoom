$ErrorActionPreference = 'Stop'

$base = 'http://localhost:5000'
$results = @()

function Add-Result {
  param(
    [string]$Step,
    [string]$Status,
    [string]$Details
  )

  $script:results += [pscustomobject]@{
    Step = $Step
    Status = $Status
    Details = $Details
  }
}

function Get-ErrorBody {
  param($ErrorRecord)

  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
    return $ErrorRecord.ErrorDetails.Message
  }

  return $ErrorRecord.Exception.Message
}

try {
  Invoke-WebRequest -Method Get -Uri "$base/" | Out-Null
  Add-Result 'Server Reachable' 'PASS' 'GET / returned 200'
} catch {
  Add-Result 'Server Reachable' 'FAIL' (Get-ErrorBody $_)
  $results | Format-Table -AutoSize | Out-String | Write-Output
  exit 1
}

try {
  $loginBody = @{ email = 'testadmin@jamroom.com'; password = 'TestAdmin@123' } | ConvertTo-Json
  $loginResp = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType 'application/json' -Body $loginBody
  $token = $loginResp.token
  if (-not $token) { throw 'No token returned from login' }
  $headers = @{ Authorization = "Bearer $token" }
  Add-Result 'Admin Login' 'PASS' 'Token acquired'
} catch {
  Add-Result 'Admin Login' 'FAIL' (Get-ErrorBody $_)
  $results | Format-Table -AutoSize | Out-String | Write-Output
  exit 1
}

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$userId = $null
$bookingId = $null

try {
  $createUserBody = @{ name = "PDF Smoke $stamp"; email = "pdf.smoke.$stamp@example.com"; mobile = '9876543210' } | ConvertTo-Json
  $userResp = Invoke-RestMethod -Method Post -Uri "$base/api/admin/users" -Headers $headers -ContentType 'application/json' -Body $createUserBody
  $userId = $userResp.user._id
  Add-Result 'Create User' 'PASS' "userId=$userId"
} catch {
  Add-Result 'Create User' 'FAIL' (Get-ErrorBody $_)
}

if ($userId) {
  try {
    $bookingDate = (Get-Date).AddDays(20).ToString('yyyy-MM-dd')
    $bookingPayload = @{
      userId = $userId
      date = $bookingDate
      startTime = '03:00'
      endTime = '05:00'
      duration = 2
      overrideDateTime = $true
      rentals = @(
        @{
          name = 'JamRoom (Base)'
          price = 500
          quantity = 1
          rentalType = 'inhouse'
          description = 'Smoke rental'
        }
      )
      subtotal = 1000
      bandName = 'Smoke Band'
      notes = 'PDF smoke booking'
    } | ConvertTo-Json -Depth 8

    $bookingResp = Invoke-RestMethod -Method Post -Uri "$base/api/admin/bookings" -Headers $headers -ContentType 'application/json' -Body $bookingPayload
    $bookingId = $bookingResp.booking._id
    Add-Result 'Create Booking' 'PASS' "bookingId=$bookingId"
  } catch {
    Add-Result 'Create Booking' 'FAIL' (Get-ErrorBody $_)
  }
}

if ($bookingId) {
  try {
    $pdfAdmin = Invoke-WebRequest -Method Get -Uri "$base/api/admin/bookings/$bookingId/download-pdf" -Headers $headers
    Add-Result 'Admin Download PDF' 'PASS' "status=$($pdfAdmin.StatusCode), bytes=$($pdfAdmin.Content.Length), type=$($pdfAdmin.Headers['Content-Type'])"
  } catch {
    Add-Result 'Admin Download PDF' 'FAIL' (Get-ErrorBody $_)
  }

  try {
    $pdfUser = Invoke-WebRequest -Method Get -Uri "$base/api/bookings/$bookingId/download-pdf" -Headers $headers
    Add-Result 'User Download PDF' 'PASS' "status=$($pdfUser.StatusCode), bytes=$($pdfUser.Content.Length), type=$($pdfUser.Headers['Content-Type'])"
  } catch {
    Add-Result 'User Download PDF' 'FAIL' (Get-ErrorBody $_)
  }

  try {
    $ebillPayload = @{ includeCustomer = $false; additionalEmails = @('smoke.pdf.flow@example.com') } | ConvertTo-Json
    $ebillResp = Invoke-RestMethod -Method Post -Uri "$base/api/admin/bookings/$bookingId/send-ebill" -Headers $headers -ContentType 'application/json' -Body $ebillPayload
    Add-Result 'Send E-bill' 'PASS' $ebillResp.message
  } catch {
    Add-Result 'Send E-bill' 'FAIL' (Get-ErrorBody $_)
  }
}

try {
  $quotePayload = @{
    recipientUserIds = @()
    additionalEmails = @('smoke.quote.flow@example.com')
    quotation = @{
      rentalTypeLabel = 'Smoke Quotation'
      notes = 'Smoke quotation test'
      schedules = @{
        inhouse = @{
          date = (Get-Date).AddDays(25).ToString('yyyy-MM-dd')
          startTime = '10:00'
          endTime = '12:00'
        }
      }
      rentals = @(
        @{
          name = 'JamRoom (Base)'
          category = 'JamRoom'
          description = 'Smoke quote item'
          rentalType = 'inhouse'
          quantity = 1
          price = 1000
        }
      )
    }
  } | ConvertTo-Json -Depth 10

  $quoteResp = Invoke-RestMethod -Method Post -Uri "$base/api/admin/quotations/send" -Headers $headers -ContentType 'application/json' -Body $quotePayload
  Add-Result 'Send Quotation' 'PASS' $quoteResp.message
} catch {
  Add-Result 'Send Quotation' 'FAIL' (Get-ErrorBody $_)
}

$results | Format-Table -AutoSize | Out-String | Write-Output
