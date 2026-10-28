# Car Park

Offline Android app for running an open-land car park. Built with React Native + Expo (SDK 58), with all data stored on the phone in SQLite. No cloud database is used.

## Features

- **Check vehicle** (home screen): type the number plate and see the result straight away.
  - Registered and paid this month: **PAID**
  - Registered, not paid, on or before the 10th: **DUE**. Tell the customer, and collect Rs. 2,500 there if they pay.
  - Registered, not paid, after the 10th: **OVERDUE**
  - Not registered: charge Rs. 200 and print or share a receipt, or register them.
- **Register customer**: vehicle number, name, phone, address, vehicle type. A customer can be edited or deactivated later.
- **Customers**: search by plate, name or phone, and filter to "Not paid this month".
- **Customer detail**: status, unpaid months since registration, a full payment history, recording a payment for any month, and printing, sharing or deleting receipts.
- **Report & transfer**: today's collections, the list of unpaid customers, and phone-to-phone data transfer.
- **Receipts**: print through Android's print service (Bluetooth or Wi-Fi printers), or share as a PDF by WhatsApp, SMS or email.
- **App lock**: asks for the phone's fingerprint or PIN on start and after 5 minutes in the background.

## Moving data between phones (no cloud)

1. Phone A: **Report & transfer → Export & send data**. Send the `.json` file by Bluetooth, Quick Share, Gmail or WhatsApp.
2. Phone B: save the file, then **Import data file**.

An import **merges** the data and never wipes anything. Customers keep the most recently edited version. Payments and one-time parkings are added if they are new. A month that was paid on both phones is stored only once. Both phones can collect money on the same day and then exchange files both ways.

The file includes customer names and phone numbers, so send it only to the owner's own phones.

Limitation: when you delete a payment on one phone, the delete does not carry over to the other phone. Delete it on both phones.

## Fees

The fees are set in `src/lib/format.ts`: `MONTHLY_FEE` (2500), `CASUAL_FEE` (200) and `DUE_DAY` (10).

## Run / build

```bash
npm install
npx expo run:android          # needs Android Studio + a phone with USB debugging, or an emulator
```

To build an installable APK without Android Studio, use EAS Build:

```bash
npx eas-cli@latest build -p android --profile preview
```

(The `preview` profile needs `"android": { "buildType": "apk" }` in `eas.json`.)

Expo Go does not include every native module this app uses, so use a development build.

## Project layout

```
src/App.tsx                 navigation, database provider, app lock
src/db/database.ts          SQLite schema and queries
src/db/transfer.ts          export / validated import + merge
src/lib/format.ts           fees, dates, plate formatting
src/lib/receipt.ts          receipt HTML → print / PDF share
src/screens/*               UI screens
```
