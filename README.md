# Ethereum Transaction Crawler

### Installation

1. Clone the repository or ensure you're in the project directory:

```bash
cd origintrail
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
# Create .env.local file
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

**Getting an Etherscan API Key:**

1. Go to [https://etherscan.io/apis](https://etherscan.io/apis)
2. Create a free account
3. Navigate to the API Keys section
4. Generate a new API key (free tier allows 5 calls/second)
5. Copy the API key and add it to your `.env.local` file

### Running the Application

1. Start the development server:

```bash
npm run dev
```

2. Open your browser and navigate to (http://localhost:3000)

## Usage

1. **Set up your API key** (see instructions above)
2. **Transaction Crawler**:

   - Enter any valid Ethereum address (e.g., `0xaa7a9ca87d3694b5755f213b5d04094b8d0f0a6f`)
   - Enter a starting block number (e.g., `9000000`)

3. **Historical Balance**:
   - Enter any valid Ethereum address
   - Select any date
   - Click "Get Historical Balance" to get real historical balance data

## Technology Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui
- **Forms**: React Hook Form with Zod validation
- **Blockchain Integration**: Etherscan API, ethers.js
- **HTTP Client**: Axios
- **Date Handling**: date-fns
