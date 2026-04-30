$ErrorActionPreference = 'Stop'

$base = 'http://localhost:5000'
$results = @()

function Add-Result {
  param(
    [string]$Name,
    [string]$Status,
    [string]$Details
  )

  $script:results += [pscustomobject]@{
    Test = $Name
    Status = $Status
    Details = $Details
  }
}

try {
  $loginBody = @{ email = 'admin@jamroom.com'; password = 'Admin@123' } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType 'application/json' -Body $loginBody
  $token = $login.token
  if (-not $token) { throw 'No token in login response' }

  $headers = @{ Authorization = "Bearer $token" }
  Add-Result 'Admin login' 'PASS' 'Authenticated as admin user'
} catch {
  Add-Result 'Admin login' 'FAIL' $_.Exception.Message
  $results | Format-Table -AutoSize | Out-String | Write-Output
  exit 1
}

try {
  $usersResp = Invoke-RestMethod -Method Get -Uri "$base/api/admin/users?q=admin&limit=10" -Headers $headers
  Add-Result 'Admin users list API' 'PASS' "Returned count=$($usersResp.count)"
} catch {
  Add-Result 'Admin users list API' 'FAIL' $_.Exception.Message
}

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$email = "admin.flow.$stamp@example.com"
$newUserId = $null

try {
  $createUserBody = @{ name = "Admin Flow Test $stamp"; email = $email; mobile = '9876543210' } | ConvertTo-Json
  $createUserResp = Invoke-RestMethod -Method Post -Uri "$base/api/admin/users" -Headers $headers -ContentType 'application/json' -Body $createUserBody
  $newUserId = $createUserResp.user._id
  Add-Result 'Admin create user API' 'PASS' "Created user=$email"
} catch {
  Add-Result 'Admin create user API' 'FAIL' $_.Exception.Message
}

try {
  $dupBody = @{ name = 'Dup User'; email = $email; mobile = '9876543210' } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$base/api/admin/users" -Headers $headers -ContentType 'application/json' -Body $dupBody | Out-Null
  Add-Result 'Duplicate user rejected' 'FAIL' 'Duplicate unexpectedly created'
} catch {
  $statusCode = $null
  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
    $statusCode = [int]$_.Exception.Response.StatusCode
  }

  if ($statusCode -eq 400) {
    Add-Result 'Duplicate user rejected' 'PASS' 'Rejected with 400'
  } else {
    Add-Result 'Duplicate user rejected' 'FAIL' "Unexpected status=$statusCode"
  }
}

$date = (Get-Date).AddDays(10).ToString('yyyy-MM-dd')

try {
  $missingUserPayload = @{
    date = $date
    startTime = '10:00'
    endTime = '12:00'
    duration = 2
    rentals = @(
      @{
        name = 'JamRoom (Base)'
        price = 500
        perdayPrice = 0
        quantity = 1
        rentalType = 'inhouse'
        description = 'Base test rental'
      }
    )
    subtotal = 1000
    taxAmount = 0
    totalAmount = 1000
    bandName = 'Missing User Band'
    notes = 'Should fail missing userId'
  } | ConvertTo-Json -Depth 8

  Invoke-RestMethod -Method Post -Uri "$base/api/admin/bookings" -Headers $headers -ContentType 'application/json' -Body $missingUserPayload | Out-Null
  Add-Result 'Booking requires userId' 'FAIL' 'Booking unexpectedly succeeded'
} catch {
  $statusCode = $null
  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
    $statusCode = [int]$_.Exception.Response.StatusCode
  }

  if ($statusCode -eq 400) {
    Add-Result 'Booking requires userId' 'PASS' 'Rejected with 400'
  } else {
    Add-Result 'Booking requires userId' 'FAIL' "Unexpected status=$statusCode"
  }
}

if ($newUserId) {
  try {
    $bookingPayload = @{
      userId = $newUserId
      date = $date
      startTime = '10:00'
      endTime = '12:00'
      duration = 2
      rentals = @(
        @{
          name = 'JamRoom (Base)'
          price = 500
          perdayPrice = 0
          quantity = 1
          rentalType = 'inhouse'
          description = 'Base test rental'
        }
      )
      subtotal = 1000
      taxAmount = 0
      totalAmount = 1000
      bandName = 'Confirmed Band'
      notes = 'Admin confirmed+paid test'
    } | ConvertTo-Json -Depth 8

    $bookingResp = Invoke-RestMethod -Method Post -Uri "$base/api/admin/bookings" -Headers $headers -ContentType 'application/json' -Body $bookingPayload

    if ($bookingResp.booking.paymentStatus -eq 'PAID' -and $bookingResp.booking.bookingStatus -eq 'CONFIRMED') {
      Add-Result 'Admin booking forced PAID+CONFIRMED' 'PASS' "Booking=$($bookingResp.booking._id)"
    } else {
      Add-Result 'Admin booking forced PAID+CONFIRMED' 'FAIL' "Got status=$($bookingResp.booking.bookingStatus)/$($bookingResp.booking.paymentStatus)"
    }
  } catch {
    Add-Result 'Admin booking forced PAID+CONFIRMED' 'FAIL' $_.Exception.Message
  }

  try {
    $conflictPayload = @{
      userId = $newUserId
      date = $date
      startTime = '11:00'
      endTime = '13:00'
      duration = 2
      rentals = @(
        @{
          name = 'JamRoom (Base)'
          price = 500
          perdayPrice = 0
          quantity = 1
          rentalType = 'inhouse'
          description = 'Conflict rental'
        }
      )
      subtotal = 1000
      taxAmount = 0
      totalAmount = 1000
      bandName = 'Conflict Band'
      notes = 'Should fail overlap'
    } | ConvertTo-Json -Depth 8

    Invoke-RestMethod -Method Post -Uri "$base/api/admin/bookings" -Headers $headers -ContentType 'application/json' -Body $conflictPayload | Out-Null
    Add-Result 'Overlapping booking conflict' 'FAIL' 'Overlapping booking unexpectedly succeeded'
  } catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }

    if ($statusCode -eq 400) {
      Add-Result 'Overlapping booking conflict' 'PASS' 'Rejected with 400'
    } else {
      Add-Result 'Overlapping booking conflict' 'FAIL' "Unexpected status=$statusCode"
    }
  }
}

$results | Format-Table -AutoSize | Out-String | Write-Output
