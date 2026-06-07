---
name: daily-news-briefing
description: Compile and send a daily news briefing to Graeme on Telegram at 5:30 AM SAST. Fetches headlines from News24 and BBC across SA news, world news, technology, and entertainment categories.
---

# Daily News Briefing

This skill powers the 5:30 AM SAST cron that delivers a morning news digest to Graeme on Telegram.

## Sources

### News24 (South Africa)
- URL: `https://www.news24.com`
- Best for: SA news headlines, local politics, business, sport

### BBC News (International)
- URL: `https://www.bbc.com/news`
- Best for: World news, technology, entertainment

### Specific BBC sections
- **World**: `https://www.bbc.com/news/world`
- **Technology**: `https://www.bbc.com/news/technology`
- **Entertainment**: `https://www.bbc.com/news/entertainment_and_arts`

## Method

### News24
1. `agent_browser` open `https://www.news24.com`
2. `snapshot -i` — look for cookie banner buttons (usually "OK" or "Accept All")
3. If cookie banner visible, click the accept/OK button
4. `snapshot -i` again to see the headlines
5. Extract top SA news stories from heading and link elements

### BBC News
1. `agent_browser` open `https://www.bbc.com/news`
2. `snapshot -i` — BBC usually loads headlines without cookie interaction
3. Extract headlines from heading (level=2) and link elements
4. For tech and entertainment, optionally open the specific section pages

### Headline extraction
Use the raw JSON snapshot to find article headings. BBC headings appear as level=2 heading elements with clear article titles. News24 headings appear in link text.

## Formatting

Structure the briefing as follows:

```
☀️ Good morning! Here's your news briefing for [date]:

🇿🇦 *SA News*
• [Headline 1]
• [Headline 2]
• [Headline 3]

🌍 *World News*
• [Headline 1]
• [Headline 2]
• [Headline 3]

💻 *Technology*
• [Headline 1]
• [Headline 2]
• [Headline 3]

🎬 *Entertainment*
• [Headline 1]
• [Headline 2]
• [Headline 3]
```

- 3–5 headlines per category
- Complete sentences or clear headline text

## Delivery

- Send via `send_message` to Telegram chat ID 8672094762
- Always use markdown formatting

## Logging

- Remember in today's daily log under Facts that the briefing was sent
- Note any source load failures
