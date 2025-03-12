BEGIN {
    # ANSI color codes
    RED="\033[31m";
    GREEN="\033[32m";
    YELLOW="\033[33m";
    GRAY="\033[90m";
    BOLD="\033[1m";
    RESET="\033[0m";
}

/Connecting|Dubious|Failed|error|ERROR|exit 1|Result: FAIL/ {
    print RED $0 RESET;
    next;
}

/ok$/ {
    print GREEN $0 RESET;
    next;
}

/\.\.\.+/ {
    test = $1;
    result = $NF;
    if (result == "ok") {
        printf "%s %s %s\n", test, GRAY RESET, GREEN result RESET;
    } else {
        printf "%s %s %s\n", RED test RESET, GRAY RESET, RED result RESET;
    }
    next;
}

/Test Summary Report|-------------------/ {
    print YELLOW BOLD $0 RESET;
    next;
}

/\(Wstat:.*/ {
    sub(/^[[:space:]]+/, "");
    filename = $1;
    print YELLOW "  " RED filename RESET YELLOW $2 $3 $4 $5 $6 RESET;
    next;
}

/^Files=|^Result:/ {
    if ($0 ~ /FAIL/) {
        print RED BOLD $0 RESET;
    } else {
        print YELLOW $0 RESET;
    }
    next;
}

/Try rerunning/ {
    print YELLOW $0 RESET;
    next;
}

{
    print;
}
