#!/bin/bash

FILE="$1"
TMP="$FILE.tmp"

mv $FILE $TMP

while read line
do
    echo "$line" >> $FILE
done

cat $TMP >> $FILE

rm $TMP
