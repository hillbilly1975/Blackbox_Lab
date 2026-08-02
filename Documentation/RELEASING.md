# Releasing Blackbox Lab

Everything here is done in the browser on github.com — no git, no
terminal.

## The one rule

**The version lives in two files, and the tag does not change them.**

| where | what it controls |
|---|---|
| `package.json` | the name of every installer — `Blackbox.Lab-0.3.7.Setup.exe` — and the version the operating system sees |
| `src/version.js` (`APP_VERSION`) | the version shown in the sidebar, and the one the update check compares against the latest release |
| the git tag `v0.3.7` | the name of the release page, and the trigger that starts the build |

All three need to say the same thing. The two files are bumped for
you in the pull request that prepares a release, so in practice:
**merge the release PR first, tag second.**

The build checks all three before it starts. If they do not match you
get a red ✗ within a minute naming the file to update, so nothing is
built under the wrong number.

## Steps

1. **Merge the release pull request.** It bumps both files and adds
   the changelog entry.
2. Go to **Releases → Draft a new release**.
3. **Choose a tag** → type `v0.3.7` → *Create new tag on publish*.
   The `v` matters: the build only listens for tags starting with `v`.
4. Title and description — paste the release text.
5. **Publish release.**
6. Open the **Actions** tab. A run called *Release* starts. It takes
   roughly 15–25 minutes and produces a **draft** release with the
   installers attached.
7. When it finishes, go back to **Releases**, open the draft, check
   the file names carry the right version, and **Publish** it.

## What gets built

| platform | file |
|---|---|
| Windows | `Blackbox.Lab-0.3.7.Setup.exe` (plus zip and nupkg) |
| macOS, Apple Silicon (M1 and newer) | `Blackbox.Lab-darwin-arm64-0.3.7.zip` |
| macOS, Intel (2020 and older) | `Blackbox.Lab-darwin-x64-0.3.7.zip` |
| Linux | `.deb`, `.rpm` and a zip |

Two Mac files is correct. An Apple Silicon Mac cannot run the Intel
build well and an Intel Mac cannot run the Apple Silicon build at
all, so pilots pick the one matching their machine — **About This
Mac** tells them which: "Apple M…" means Apple Silicon, "Intel Core…"
means Intel.

Neither Mac build is code-signed, and macOS quarantines unsigned
downloads. What pilots see depends on their machine, and both cases
are normal for free unsigned apps, needed only once:

- **Apple Silicon** shows *"Blackbox Lab is damaged and can't be
  opened"*. The download is fine — clearing the quarantine flag in
  Terminal makes it open normally:
  `xattr -cr "/Applications/Blackbox Lab.app"`
- **Intel** Macs usually just need **right-click → Open** on the
  first launch.

The README's Download section carries the same instructions for
pilots.

## If something goes wrong

**The build never started.** The tag is missing its `v`, or the
release was created on a tag that already existed. A release published
onto an existing tag does not trigger anything — delete the release
*and the tag*, then create both fresh.

**Red ✗ saying "Version mismatch".** The tag and the version files
are not on the same number yet. Merge the version bump to main, delete
the tag, and tag again.

**One platform failed, the others worked.** The failed platform simply
has no file on the draft. Read its log in Actions; the other
installers are still good and can be published.
