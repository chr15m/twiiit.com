# Twiiit

## Redirecting proxy for Nitter instances

<!-- ui goes here -->

There are currently <!-- instances --> instances online.

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

## Privacy FAQ

> What infrastructure does twiiit.com run on?

The site runs on a Digital Ocean VPS physically located in Singapore.

> Are you (chr15m, the developer) the only one with root access to it?

Yes, I am technically the only person with root access to the machine.
Digital Ocean staff may also be able to access the machine as per this answer on their FAQ site:

<https://www.digitalocean.com/community/questions/can-digitalocean-staff-access-the-files-on-my-droplet>

> Do you keep logs of queries and IP addresses where they are coming from and going to?

IP addresses are not logged.
Access logs are stored on the server in NCSA combined log format with the IP address replaced with `127.0.0.1` due to proxying.
All requested URLs are written to the log file, and also the useragent string.
The earliest logfile currently on the server is dated 2021-02-21.
Here is an example of a request in the log file:

```
::ffff:127.0.0.1 - - [14/Feb/2022:00:02:58 +0000] "GET /jack HTTP/1.1" 302 60 "-" "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36"
```

> Using twiiit.com adds a layer where one's IP is visible.
> One's IP is visible to twiiit.com then to whatever Nitter instance twiiit.com redirects the query to.
> Is this correct?

Yes. When somebody uses the site their IP is visible to the service.
Once they are redirected to one of the Nitter instances their IP is visible to that particular instance.

You can use Tor or a VPN to obfuscate your IP address and useragent.
