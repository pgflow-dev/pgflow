You are tasked with reading a note file from "notes" folder.
The folder path is: !`realpath $notes`

There are following files:

<list>
!`ls $notes/`
</list>

You must find file that most closely matches this user query: "$ARGUMENTS".

If there are multiple files matching the query, you should present user with choice and do not read any contents until he tells you which one.

When presenting files, do them as a a/b/c/d/e.... choice, like this:

a) fileA.md
b) fileB.md

etc.

If you are certain there is only one file that strongly matches user query, read it and do not ask user to choose.

If you are rather certain there is no file that matches user query, suggest closest matches to choose from.
