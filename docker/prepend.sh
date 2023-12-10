#!/bin/bash

# Takes a file provided via command-line argument and prepends it with input provided via STDIN

FILE="$1"
TMP="$FILE.tmp"

mv $FILE $TMP

while read line
do
echo "$line" >> $FILE
done

cat $TMP >> $FILE

rm $TMP