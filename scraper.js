name: Scrape JRA Races

on:
  schedule:
    # Run every day at 2 AM UTC (after most JRA races finish)
    - cron: '0 2 * * *'
  workflow_dispatch: # Allows manual triggering
  push:
    branches:
      - main
    paths:
      - 'scraper.js'

jobs:
  scrape:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          npm install node-fetch cheerio
      
      - name: Run scraper
        run: |
          node scraper.js
      
      - name: Check if races.json was created
        run: |
          if [ ! -f races.json ]; then
            echo "::error::races.json was not created!"
            exit 1
          fi
          echo "races.json size: $(wc -c < races.json) bytes"
          echo "Number of races: $(jq '. | length' races.json)"
      
      - name: Commit and push if changed
        run: |
          git config --global user.name 'GitHub Actions Bot'
          git config --global user.email 'github-actions[bot]@users.noreply.github.com'
          
          # Pull latest changes first to avoid conflicts
          git pull --rebase origin main || git pull origin main
          
          git add races.json
          
          # Check if there are changes
          if git diff --staged --quiet; then
            echo "No changes to races.json"
          else
            git commit -m "Update races.json - $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
            git push
            echo "::notice::races.json updated and pushed"
          fi
      
      - name: Upload races.json as artifact
        uses: actions/upload-artifact@v4
        with:
          name: races-json
          path: races.json
          retention-days: 7
      
      - name: Create summary
        run: |
          echo "## JRA Race Scraper Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Run time:** $(date -u '+%Y-%m-%d %H:%M:%S UTC')" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Total races:** $(jq '. | length' races.json)" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Graded stakes:** $(jq '[.[] | select(.grade != "")] | length' races.json)" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Date range:** $(jq -r '[.[].date] | min' races.json) to $(jq -r '[.[].date] | max' races.json)" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### Recent Graded Stakes" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          jq -r '.[:10] | .[] | select(.grade != "") | "- **\(.title)** (\(.grade)) - \(.date) - \(.track)"' races.json >> $GITHUB_STEP_SUMMARY || echo "No graded stakes found" >> $GITHUB_STEP_SUMMARY
