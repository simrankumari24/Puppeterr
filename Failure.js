import json, sys
from collections import Counter

d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "log.json"))
ends = [x for x in d if x.get("kind") == "task" and x.get("phase") == "end" and not x.get("completed")]

causes = Counter()
for e in ends:
    text = (str(e.get("errorMessage", "")) + " " + str(e.get("result", ""))).lower()
    if "crashed" in text or "oom" in text or "renderer" in text:
        causes["browser_crash_OOM"] += 1
    elif "captcha" in text or "challenge" in text:
        causes["captcha"] += 1
    elif "null" in text and ("read properties" in text):
        causes["null_reference_bug"] += 1
    elif "timeout" in text:
        causes["timeout"] += 1
    else:
        causes["other_unclassified"] += 1

total = len(ends)
print(f"Total failed/incomplete tasks: {total}\n")
for cause, count in causes.most_common():
    print(f"  {cause:<24} {count:>3}  ({count/total*100:.0f}%)" if total else "")
