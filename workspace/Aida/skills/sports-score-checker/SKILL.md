---
name: sports-score-checker
description: Check live and final scores for tennis (Grand Slams), rugby sevens (SVNS/Blitzbokke), and golf (LPGA). Use when Graeme asks for sports scores, leaderboards, or match results.
---

# Sports Score Checker

Use `agent_browser` to fetch scores from sports websites. Sources and parsing differ by sport.

## Tennis (Grand Slams)

### Sources
- **TNT Sports** (UK/Eurosport) — `https://www.tntsports.co.uk/tennis/french-open/` (good for live scores)
- **ESPN** — `https://www.espn.com/tennis/scoreboard/_/tournament/roland-garros`
- **Official site** — `https://www.rolandgarros.com/en-us/matches/2026/SD001`

### How to read scores (TNT Sports format)
Open the TNT Sports page and get the live link text from the snapshot. The link text contains a pattern like:

```
M. Chwalinska M. Andreeva (8) Score 3 Score 5
```

This means Chwalinska has 3 games, Andreeva has 5 in the current set. When multiple sets are played, the pattern extends:

```
Score 3 Score 0 Score 6 Score 2
```

This means:
- Set 1: Player1 3, Player2 6 (Player2 won set 6-3)
- Set 2: Player1 0, Player2 2 (Player2 leads 2-0)

Look for headings like "What a point! Watch as Andreeva wins opening set" to confirm set outcomes.

### Method
1. `agent_browser` open the TNT Sports page
2. `snapshot -i` to get the compact view
3. Read the link text for the match using the raw JSON `refs` data
4. Parse the "Score X Score Y" pattern to extract game scores per set
5. Look for "LIVE" status to confirm match is ongoing

## Rugby Sevens (SVNS / Blitzbokke)

### Source
- **SA Rugby Magazine** — `https://www.sarugbymag.co.za/` (best for Blitzbokke results)
- **SVNS Official** — `https://www.svns.com/en/events/bordeaux` (event page with news)

### Method
1. `agent_browser` open SA Rugby Magazine front page
2. `snapshot -i` to see headlines
3. Look for Blitzbokke-related article titles (e.g. "Blitzboks edge Fiji", "Great Britain edge Blitzboks")
4. Click through articles for details when needed
5. For event schedules/scores, also check SVNS event page

### Key patterns
- "Blitzboks edge [team]" = close win
- "Blitzboks bounce back" = won after a loss
- "Great Britain edge Blitzboks" = close loss
- "golden-point thriller" = overtime loss

## Golf (LPGA)

### Source
- **LPGA Official** — `https://www.lpga.com/leaderboard` or specific tournament leaderboard

### Method
1. `agent_browser` open the LPGA leaderboard page
2. `snapshot -i` to see the leaderboard
3. Extract player positions from the rowheader and cell entries
4. The structure is:
   - RowHeader: Position (e.g. "T1 No Change")
   - Cell: Player name + country
   - Cell: Total score (under/over par)
   - Cell: Today's score
   - Cell: Thru
   - Cell: Round 1 score
   - Cell: Round 2 score
5. Look for the "Showing Round X" combobox to know which round is active

### Formatting output
Format as a markdown table with Pos, Player, Total, R1, R2 columns. Note if Round 3 is in progress.

## General delivery
- Send results to Graeme on Telegram using `send_message` with chat ID 8672094762
- Use markdown formatting (bold for player names and scores)
- Include emoji headers (🎾 for tennis, 🏉 for rugby, ⛳ for golf)
- Remember the result in today's daily log under Facts
