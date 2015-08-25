package main

import (
	"fmt"
	"os"
	"io/ioutil"

	"github.com/dotabuff/manta"
	"github.com/dotabuff/manta/dota"
)

func main() {
    	bytes, err := ioutil.ReadAll(os.Stdin)
    	parser, err :=manta.NewParser(bytes)
		//parser, err := manta.NewParserFromFile(arg)
		if err != nil {
			panic(err)
		}

//things we need
//entities for player interval data
//entities for wards
//every second, check for new wards
//maintain a hash table of seen ward handles, output if we see a new ward
//output playerresource entity state (gold/lh/xp/x/y)
//CDOTAUserMsg_LocationPing for pings
//CDOTAUserMsg_ChatEvent for chat events, objectives
//CDemoFileInfo for epilogue, player names
//get final player interval data for stuns

//following is currently done by parser but could be done in JS
//illusion_ should be prepended if illusion
//item_ should be removed from item key names

		//chat
		/*
		parser.Callbacks.OnCUserMessageSayText2(func(m *dota.CUserMessageSayText2) error {
			fmt.Printf("(%s) | %s: %s\n", m.GetMessagename(), m.GetParam1(), m.GetParam2())
			return nil
		})
		*/
		
		parser.Callbacks.OnCDemoPacket(func(m *dota.CDemoPacket) error {
			fmt.Printf("%s, %s\n", m);
			panic("test")
			return nil
		})
		
		//actions
		/*
		parser.Callbacks.OnCDOTAUserMsg_SpectatorPlayerUnitOrders(func(m *dota.CDOTAUserMsg_SpectatorPlayerUnitOrders) error {
			fmt.Printf("%s\n", m)
			return nil
		})
		*/
		
		//combat log
		/*
		parser.GameEvents.OnDotaCombatlog(func(m *GameEventDotaCombatlog) error {
			fmt.Printf("%s\n", m)
			return nil
		})
		*/
		parser.Start()

}