# Twiiit

## Redirecting proxy for Nitter instances

Enter a Twitter username and press "go" to be redirected to a nitter instance serving that profile.

<input id="username" placeholder="username"/><button onclick="document.location.href=username.value">go</button>

[Nitter](https://nitter.net/) is an alternative frontend for Twitter.
There are many [public nitter instances](https://github.com/zedeus/nitter/wiki/Instances) which have varying levels of uptime.
Some instances are rate limited, presumably due to high demand.

The purpose of this site is to redirect you to a public instance that is known to be running and not rate limited.
This should help distribute the load more evenly across instances so they do not get rate limited as often.

This site pings each public instance listed in [the wiki](https://github.com/zedeus/nitter/wiki/Instances) every five minutes to check if they are rate limited.

You can append any valid Twitter/Nitter URL to this page to be redirected. For example:

 * [/mccrmx](/mccrmx) will redirect you to my profile.
 * [/mccrmx/rss](/mccrmx/rss) will redirect you to the RSS feed for my profile.
 * [/mccrmx/status/1363062307505405958](/mccrmx/status/1363062307505405958) will redirect you to a specific tweet.

<footer>

Made by <a href="https://twitter.com/mccrmx">Chris McCormick</a>.

[Source code on GitHub](https://github.com/chr15m/twiiit.com).

<a href="https://bugout.network/">bugout.network</a>

</footer>
