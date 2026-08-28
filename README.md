# Inventory POS (offline)

A single-user, **fully offline** POS + inventory app built with Expo (React Native + TypeScript).
Uses a Bill-of-Materials (BOM) pattern: selling a product auto-deducts its component
ingredients from stock — atomically, all-or-nothing.

Everything is local. No backend, no auth, no network calls. Data lives in SQLite via
[expo-sqlite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/).

## Example

"Peanut Butter Bread" (product) = 1× Bread + 30g Peanut Butter + 1× Cup.
One sale deducts all three in a single SQLite transaction. If any ingredient is short,
the whole sale is rejected and you're told exactly which ingredient and how much is missing.

## Tabs

- **Sales** — product grid → cart → tap a product to add. Opens a cart to adjust qty and **Charge**.
  Blocks on insufficient stock and names the short ingredient(s). No confirm dialogs — made for fast hands.
- **Inventory** — view/edit ingredients and low-stock thresholds. Manual **+Add / −Remove** adjustments
  with a reason (Restock, Waste, Damage, Correction, or custom) — every change is logged.
- **Products** — build products and their recipes (which ingredients, and how much each unit consumes).
  Deactivate (not delete) products that have sales history.
- **History** — sales log with date filters (Today / Yesterday / 7 Days / Month / All) and a revenue summary.

## Data model

| Table               | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `ingredients`       | stock items: name, unit, `quantity_on_hand`, low threshold       |
| `products`          | sellable items: name, price, `is_active`                         |
| `recipes`           | BOM links: `product_id` → `ingredient_id` + `quantity_required`  |
| `sales`             | each sale line + `total_price` + ISO `timestamp`                 |
| `stock_movements`   | audit log: signed `change_amount`, reason, time, related sale    |

Migrations use `PRAGMA user_version` in `src/db/migrate.ts`. All writes are wrapped in
`withExclusiveTransactionAsync` so stock is never partially updated.

## Setup

```bash
npm install
```

On first launch the app seeds a small demo dataset (PB Bread / PB&J) so you can tap around
immediately.

## Run in development

Install **Expo Go** on your phone, then:

```bash
npm start        # or: npx expo start
```

Scan the QR code with Expo Go. Changes hot-reload.

## Build the Android APK

Requires an Expo account (sign up at expo.dev).

```bash
npx eas-cli login
npx eas-cli build:configure   # generates app config / eas.json (already provided)
npx eas-cli build -p android --profile production
```

The last command builds an installable **`.apk`** (configured in `eas.json` → `production.android.buildType: "apk"`).
The download link appears in your terminal and on [expo.dev/builds](https://expo.dev).

> The Android package id (`com.inventory.pos`) is a placeholder — change it in `app.json` before
> you build if you plan to distribute it.

## Project layout

```
App.tsx                     SQLiteProvider + NavigationContainer + seed
src/
  db/                       schema, migrations, typed CRUD, transactional sellProducts()
  components/ui.tsx         shared modals, inputs, chips, steppers
  screens/                  Sales, Inventory, Products, History
  navigation/               bottom-tab navigator
  state/                    zustand cart + data-version refresh
  theme.ts, utils.ts        colors/space, money/date/number formatting
```

### Key transaction — `src/db/sales.ts`

`sellProducts(cart)` (1) validates every product, (2) aggregates ingredient requirements across
all cart lines, (3) checks stock for all of them and throws `InsufficientStockError` before any
write, then (4) commits sales + stock deductions + movements in one transaction.
`CHECK (quantity_on_hand >= 0)` is a second line of defense against negative stock.