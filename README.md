# Order Tracker - CSV Data Source

A modern, beautiful order tracking web application that reads tracking data from a CSV file and automatically refreshes on every page load.

## Features

- ✨ Modern, responsive UI with clean design
- 📦 Track multiple orders from different carriers
- 🔄 Automatic data refresh on every page load
- 📍 Detailed tracking information with checkpoints
- 🎨 Status badges with color coding (Delivered, In Transit, Pending, Exception, etc.)
- 📱 Mobile-friendly design
- 📄 Reads data from CSV file in real-time

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up CSV File

1. Place your tracking data CSV file in the `public` folder as `tracking_data.csv`
2. The CSV file should have the following columns (case-insensitive, spaces/underscores allowed):

**Required columns:**
- `tracking_number` - The tracking number
- `carrier` or `slug` - The shipping carrier (e.g., ups, usps, fedex)
- `status` or `tag` - The order status (e.g., delivered, in transit, pending, exception)

**Optional columns:**
- `order_id` or `order` - Order ID
- `title` or `order_title` - Order title/description
- `city` or `destination_city` - Destination city
- `state` or `destination_state` - Destination state
- `last_updated` or `updated_at` or `date` - Last update timestamp
- `message` or `checkpoint_message` - Latest checkpoint message
- `location` or `checkpoint_location` - Checkpoint location
- `checkpoint_date` or `message_date` - Checkpoint date

**Example CSV format:**
```csv
tracking_number,carrier,status,order_id,title,city,state,last_updated,message,location
1Z999AA10123456784,ups,In Transit,ORD-12345,Summer Collection Order,New York,NY,2024-01-15 10:30:00,Package is in transit,New York Distribution Center
9400111899223197428490,usps,Delivered,ORD-12346,Electronics Purchase,Los Angeles,CA,2024-01-14 15:20:00,Delivered to recipient,Los Angeles Post Office
9274890123456789012345,fedex,Pending,ORD-12347,Books Order,Chicago,IL,2024-01-16 08:15:00,Label created,Chicago Sorting Facility
```

### 3. Start Development Server

```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

The app will automatically load data from `public/tracking_data.csv` on every page load/refresh.

## Usage

### Automatic Data Refresh

- The CSV file is automatically loaded and parsed when the page loads
- Click the "🔄 Refresh Data" button to manually reload the CSV
- The app uses cache-busting to ensure fresh data on every load

### Viewing Order Status

Each order card displays:
- Tracking number
- Carrier information
- Current status with color-coded badge
- Order ID (if provided)
- Destination information
- Latest checkpoint with location and timestamp

### Updating the CSV File

Simply update the `public/tracking_data.csv` file with new data:
- Add new rows for new orders
- Update existing rows to reflect status changes
- The website will load the latest data on every refresh

**Note:** If you're running the dev server, you may need to save the file for changes to be detected. In production, simply replace the CSV file and refresh the page.

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## CSV Data Format

The app is flexible with column names and will automatically match common variations:
- Status values: "delivered", "in transit", "in-transit", "pending", "exception", "out for delivery", etc.
- Column names are normalized (case-insensitive, spaces converted to underscores)

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **PapaParse** - CSV parsing library
- **CSS3** - Modern styling

## Project Structure

```
├── index.html              # HTML entry point
├── package.json            # Dependencies and scripts
├── vite.config.ts         # Vite configuration
├── tsconfig.json           # TypeScript configuration
├── public/
│   └── tracking_data.csv   # Your tracking data CSV file
└── src/
    ├── main.tsx            # React entry point
    ├── App.tsx             # Main app component
    ├── App.css             # App styles
    ├── index.css           # Global styles
    └── services/
        └── csvService.ts   # CSV parsing and data loading service
```

## Troubleshooting

### CSV File Not Loading

- Ensure `tracking_data.csv` exists in the `public` folder
- Check that the CSV file has the required columns (tracking_number, carrier/slug, status/tag)
- Verify the CSV file is properly formatted (no extra commas, proper quotes for text with commas)
- Check the browser console for any parsing errors

### No Data Displayed

- Verify your CSV has at least one row with a valid `tracking_number`
- Make sure column headers match expected names (case-insensitive)
- Check that the status values are recognized (delivered, in transit, pending, etc.)

### Data Not Updating

- The app uses cache-busting to fetch fresh data on every load
- Try hard refreshing the page (Ctrl+Shift+R or Cmd+Shift+R)
- Click the "Refresh Data" button to manually reload

## License

MIT
