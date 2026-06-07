---
name: sports-score-checker
description: Check live and final scores for tennis (Grand Slams), rugby sevens (SVNS/Blitzbokke), and golf (LPGA). Use when Graeme asks for sports scores, leaderboards, or match results.
---

# Sports Score Checker

Use `agent_browser` to fetch scores from sports websites. Sources and parsing differ by sport.

## Tennis (Grand Slams)

### Sources
- **Official Roland Garros live page** — `https://www.rolandgarros.com/en-us/matches?status=live` (best for live scores — shows game scores per set, current game points, elapsed time)
- **ESPN** — `https://www.espn.com/tennis/scoreboard/_/tournament/roland-garros` (good for compact summaries)
- **TNT Sports** — `https://www.tntsports.co.uk/tennis/french-open/` (good for headlines and live blogs)

### How to read scores (Roland Garros official format)
The official live page link text contains a pattern like:

```
Men's Singles LIVE Court Philippe-Chatrier - FINAL 1h07 ITA F.Cobolli (10) 40 1 3 GER A.Zverev (2) 40 6 3
```

This parses as:
- **Duration**: 1h07 played
- **Cobolli**: 40 (current game points), 1 (games in set 1), 3 (games in current set)
- **Zverev**: 40 (current game points), 6 (games in set 1 — won set 6-1), 3 (games in current set)
- So: Set 1: Zverev 6-1 ✅, Set 2: 3-3 (40-40 in current game)

### Method
1. `agent_browser` open the Roland Garros live page
2. `snapshot -i` to get the compact view
3. Read the link text for the match to extract game scores per set and current game points
4. Look for "LIVE" status, "FINAL" status, or completed indicators

## Rugby Sevens (SVNS / Blitzbokke)

### Source
- **SA Rugby Magazine** — `https://www.sarugbymag.co.za/` (best for Blitzbokke results)
- **SVNS Official** — `https://www.svns.com/en/events/{city}` (event page with news, e.g. bordeaux, singapore, hong-kong)

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
- Reply directly in the conversation turn when Graeme asks on Telegram (automatic delivery)
- For proactive updates (final results), use `send_message` to Telegram chat ID 8672094762
- Use markdown formatting (bold for player names and scores)
- Include emoji headers (🎾 for tennis, 🏉 for rugby, ⛳ for golf)
- Remember the result in today's daily log under Facts
