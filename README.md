# PoE2 Quick-Flip Dashboard

A real-time currency and item flipping dashboard for Path of Exile 2. This tool helps players identify profitable trades by analyzing market data from poe2scout.com. It includes a local CORS proxy to bypass browser restrictions when fetching data.

## Features

- **Real-time Market Data**: Fetches the latest prices and item listings.
- **Profit Calculation**: Automatically calculates potential profit (ROI) and spread for flipping items.
- **Filtering**:
  - **Category**: Filter by Currency, Fragments, Runes, Essences, etc.
  - **League**: Select the current league (e.g., Rise of the Abyssal).
  - **Reference Currency**: Calculate value in Divine Orbs, Exalted Orbs, or Chaos Orbs.
- **Quick Flip Targets**: Highlight items meeting a specific target profit percentage (TP%).
- **CORS Proxy**: Built-in local proxy server to handle API requests seamlessly.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (version 14 or higher recommended)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)

## Installation

1. Clone or download this repository.
2. Open a terminal in the project root directory.
3. Install the dependencies:

   ```bash
   npm install
   ```

## Running the Application

To run the application, you need to start the local proxy server. The frontend is served directly by this proxy.

1. Start the proxy server:

   ```bash
   npm run proxy
   ```

   You should see output indicating the server is running:
   `Local CORS proxy on http://localhost:8787/ (API at /api)`

2. Open your browser and navigate to:
   [http://localhost:8787](http://localhost:8787)

   *Note: The application determines if it's running locally and automatically uses the local proxy path (`/api`) to fetch data.*

## Usage Guide

1. **Select Category**: Choose the type of item you want to flip (e.g., Currency, Omen, Runes).
2. **Select League**: Ensure the correct league is selected (e.g., Rise of the Abyssal).
3. **Reference Currency**: Choose your base currency for valuation (Divine, Exalted, or Chaos).
4. **TP% (Target Profit)**: Set your desired minimum profit margin (default is 3%).
5. **Refresh**: Click the "Refresh" button to fetch the latest data.
6. **Analyze**: Look at the table for:
   - **Spread**: The difference between buy and sell prices.
   - **ROI**: Return on Investment percentage.
   - **Confidence**: Data reliability based on transaction volume/listings.
7. **Download CSV**: You can export the current view to a CSV file for further analysis.

## Troubleshooting

- **No Data / Empty Table**:
  - Ensure `npm run proxy` is running in your terminal.
  - Check if port `8787` is already in use by another application.
  - Verify your internet connection.

- **CORS Errors**:
  - Make sure you are accessing the site via `http://localhost:8787`. Opening `index.html` directly (file://) or via other servers might cause CORS issues if not configured to use the proxy correctly.

- **Port Conflict**:
  - If port 8787 is busy, you can modify the `PORT` variable in `proxy.cjs` and restart the server.

## Project Structure

- `proxy.cjs`: The Node.js server that acts as a proxy for API requests and serves the frontend.
- `public/`: Contains the frontend code.
  - `index.html`: Main entry point.
  - `css/`: Stylesheets.
  - `js/`: JavaScript modules (API handling, UI logic, State management).

---
*Powered by poe2scout.com API*
