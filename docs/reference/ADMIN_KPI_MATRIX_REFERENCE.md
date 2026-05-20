# Admin KPI Matrix Reference

Last updated: 2026-05-20

## Purpose

This document explains the Admin dashboard KPI matrix:
- KPI layout groups (Primary KPIs, Business Health, Operations)
- API fields that power each KPI
- Exact formulas and assumptions used in calculations
- Threshold estimates used for KPI color states

Use this as the source of truth when modifying KPI behavior in:
- `routes/admin/stats.routes.js`
- `public/js/admin/admin-dashboard.js`
- `public/css/pages/admin.css`

## KPI Layout

### Row 1: Primary KPIs
1. Total Bookings
2. Confirmed
3. Monthly Revenue
4. Outstanding Payments

### Row 2: Business Health
1. Room Utilization %
2. Revenue Growth %
3. New Customers
4. Repeat Customers

### Row 3: Operations
1. Upcoming Sessions
2. Pending Approval
3. Cancellations
4. Avg Booking Duration

## Data Source

API endpoint:
- `GET /api/admin/stats`

Main backend implementation:
- `routes/admin/stats.routes.js`

Frontend rendering:
- `public/js/admin/admin-dashboard.js`

## Backend Fields Returned

The stats API currently returns (relevant subset):
- `totalBookings`
- `pendingBookings`
- `pendingBookingApprovals`
- `pendingSlotApprovals`
- `confirmedBookings`
- `totalRevenue`
- `thisMonthRevenue`
- `lastMonthRevenue`
- `totalUnpaidAmount`
- `roomUtilizationPct`
- `revenueGrowthPct`
- `newCustomers`
- `repeatCustomers`
- `upcomingSessions`
- `cancellations`
- `avgBookingDuration`

## Metric Calculations

## Time Window Helpers

Computed at request time:
- `todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())`
- `thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)`
- `nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)`
- `lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)`

## Row 1: Primary KPIs

### 1) Total Bookings
Formula:
- `Booking.countDocuments()`

Notes:
- Counts all booking documents, regardless of status.

### 2) Confirmed
Formula:
- `Booking.countDocuments({ bookingStatus: 'CONFIRMED' })`

### 3) Monthly Revenue
Displayed value:
- `thisMonthRevenue`

Computation source:
- Iterate confirmed bookings
- Use `computeCollectedAmount({ totalAmount, paymentStatus, amountPaid })`
- Sum only bookings with `date >= thisMonthStart && date < nextMonthStart`

Pseudo:
- `thisMonthRevenue += collected` (for bookings in current month)

### 4) Outstanding Payments
Displayed value:
- `totalUnpaidAmount`

Computation source:
- For each confirmed booking:
  - `collected = computeCollectedAmount(...)`
  - `due = max(0, price - collected)`
- `totalUnpaidAmount = sum(due)`

Special UI state:
- Outstanding card becomes green when value is `<= 0`.

## Row 2: Business Health

### 1) Room Utilization %
Inputs:
- `businessHours.startTime`, `businessHours.endTime` from `AdminSettings`
- `daysInThisMonth`
- `thisMonthConfirmedDuration` (sum of `duration` for confirmed bookings in current month)

Intermediate:
- `operatingMinutesPerDay = max(0, endMinutes - startMinutes)`
- Fallback if invalid hours: `13 * 60` minutes
- `monthlyCapacityHours = (operatingMinutesPerDay / 60) * daysInThisMonth`

Formula:
- `roomUtilizationPct = monthlyCapacityHours > 0 ? (thisMonthConfirmedDuration / monthlyCapacityHours) * 100 : 0`

### 2) Revenue Growth %
Inputs:
- `thisMonthRevenue`
- `lastMonthRevenue`

Formula:
- If `lastMonthRevenue > 0`:
  - `((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100`
- Else:
  - `100` if `thisMonthRevenue > 0`
  - `0` otherwise

### 3) New Customers
Definition:
- Unique customers whose first confirmed booking date falls in current month.

Implementation details:
- Group confirmed bookings by `userId`
- Track each user's earliest confirmed booking date
- Count users where `firstBookingDate >= thisMonthStart && firstBookingDate < nextMonthStart`

### 4) Repeat Customers
Definition:
- Unique customers with at least 2 confirmed bookings (all-time, not month-limited)

Formula:
- `count(user where confirmedBookingCount >= 2)`

## Row 3: Operations

### 1) Upcoming Sessions
Formula:
- `Booking.countDocuments({ bookingStatus: 'CONFIRMED', date: { $gte: todayStart } })`

### 2) Pending Approval
Displayed value:
- `pendingBookings`

Formula:
- `pendingBookings = pendingBookingApprovals + pendingSlotApprovals`

Where:
- `pendingBookingApprovals = Booking.countDocuments({ bookingStatus: 'PENDING' })`
- `pendingSlotApprovals` is aggregated from `classSession.lessons.slotRequest.status == 'PENDING'`

### 3) Cancellations
Formula (current month):
- `Booking.countDocuments({ bookingStatus: { $in: ['CANCELLED', 'REJECTED'] }, date: { $gte: thisMonthStart, $lt: nextMonthStart } })`

### 4) Avg Booking Duration
Definition:
- Average duration of confirmed bookings in the current month.

Formula:
- `avgBookingDuration = thisMonthConfirmedCount > 0 ? thisMonthConfirmedDuration / thisMonthConfirmedCount : 0`

Display format:
- One decimal place with hour suffix (for example: `2.5h`).

## KPI Color States (Estimated Thresholds)

Applied in frontend (`admin-dashboard.js`) using card classes:
- `kpi-tone-good`
- `kpi-tone-warn`
- `kpi-tone-bad`
- `kpi-tone-neutral`

### Threshold map

1. Total Bookings
- Good: `>= 10`
- Neutral: `1 to 9`
- Warn: `0`

2. Confirmed (uses confirmation rate)
- `confirmationRate = confirmedBookings / totalBookings * 100` (0 when total is 0)
- Good: `>= 70%`
- Warn: `45% to 69.9%`
- Bad: `< 45%`

3. Monthly Revenue
- Good: `thisMonthRevenue >= lastMonthRevenue` and `thisMonthRevenue > 0`
- Warn: `thisMonthRevenue > 0` (but lower than last month)
- Bad: `0`

4. Room Utilization %
- Good: `50 to 85`
- Warn: `30 to 49.9` or `85.1 to 95`
- Bad: otherwise

5. Revenue Growth %
- Good: `>= 10`
- Warn: `0 to 9.9`
- Bad: `< 0`

6. New Customers
- Good: `>= 5`
- Warn: `2 to 4`
- Neutral: `0 to 1`

7. Repeat Customers
- Good: `>= 10`
- Warn: `4 to 9`
- Neutral: `0 to 3`

8. Upcoming Sessions
- Good: `>= 5`
- Warn: `1 to 4`
- Bad: `0`

9. Pending Approval
- Good: `0`
- Warn: `1 to 5`
- Bad: `> 5`

10. Cancellations
- Good: `0`
- Warn: `1 to 3`
- Bad: `> 3`

11. Avg Booking Duration
- Good: `1 to 4`
- Warn: `> 0` but outside `1 to 4`
- Bad: `0`

## Known Assumptions

1. Customer metrics are based on confirmed bookings only.
2. Repeat customers are all-time (not current-month-only).
3. Upcoming sessions include all future confirmed booking dates from today onward.
4. Room utilization uses configured business hours from settings and assumes one room-equivalent capacity.

## Suggested Future Improvements

1. Make threshold values configurable in Admin Settings.
2. Add tooltip help text in UI describing each KPI formula.
3. Split repeat customers into:
   - all-time repeat
   - repeat customers active in current month
4. Add timezone-safe date boundary handling if server timezone differs from business timezone.
