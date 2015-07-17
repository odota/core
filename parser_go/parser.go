package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/dotabuff/manta"
	"github.com/dotabuff/manta/dota"
)

func main() {
	for _, arg := range os.Args[1:] {
		parser, err := manta.NewParserFromFile(arg)
		if err != nil {
			panic(err)
		}

		parser.Callbacks.OnCUserMessageSayText2(func(m *dota.CUserMessageSayText2) error {
			fmt.Printf("%s (%s) | %s: %s\n", filepath.Base(arg), m.GetMessagename(), m.GetParam1(), m.GetParam2())
			return nil
		})

		parser.Start()
	}
}