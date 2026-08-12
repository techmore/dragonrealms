# Attributes

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{updateDR3|Add information about newly-extended range, and {{tt|RESPEC}} window.}}
{{RTOC}}

Every character in DragonRealms has eight '''stats''' or '''attributes''' which factor into almost everything that character does from combat to crafting:

*'''[[Strength (stat)|Strength]]''' - Strength affects your roundtimes with weapons, how hard you hit, how much you can carry, It contributes to offensive Power and Fear contests and defensive Fortitude contests, among other things.
*'''[[Reflex (stat)|Reflex]]''' - Reflex improves your skill at evading.  It contributes to defensive Reflex contests, among other things.
*'''[[Agility (stat)|Agility]]''' - Agility helps you hit with weapons, improves manual tasks such as skinning or disarming. It contributes to defensive Reflex  contests, among other things.
*'''[[Charisma (stat)|Charisma]]''' - Charisma helps you with performances, bargaining with shopkeepers, and extends your spirit health (and therefore the time it takes before you auto-depart after dying.  It contributes to offensive Spirit, Charm, and  Fear contests, among other things.
*'''[[Discipline (stat)|Discipline]]''' - Discipline increases the accuracy of damaging spells and improves the size of your experience pools.  It contributes to offensive Mind, Magic, Charm, and Fear contests and defensive Fortitude and Will contests, among other things.
*'''[[Wisdom (stat)|Wisdom]]''' - Wisdom increases the speed at which your experience turns into real ranks and increases magical spell damage.  It contributes to offensive Mind, Magic, and Spirit contests and defensive Will contests, among other things.
*'''[[Intelligence (stat)|Intelligence]]''' - Intelligence improves the size of your experience pools and increases magical spell damage.  It contributes to offensive Mind, Magic, Spirit, and Charm contests and defensive Reflex and Will contests, among other things.
*'''[[Stamina (stat)|Stamina]]''' - Stamina increases the amount of damage your body can take and improves your capacity for carrying things.  It contrubutes to offensive Power contests and defensive Fortitude contests, among other things.

The {{com|strength}}, {{com|reflex}}, {{com|agility}}, {{com|charisma}}, {{com|discipline}}, {{com|wisdom}}, {{com|intelligence}}, and {{com|stamina}} commands can be used in-game to provide useful information about each attribute.


==Starting Stats==
In January 2008, Simutronics removed random stat rolls from the character creation system. The effect is that new characters start with what used to be a perfect roll. Each race automatically receives the following starting stats:

{|class="wikitable sortable"
|-
!
![[Strength (stat)|Strength]] 
![[Reflex (stat)|Reflex]]
![[Agility (stat)|Agility]]
![[Charisma (stat)|Charisma]]
![[Discipline (stat)|Discipline]]
![[Wisdom (stat)|Wisdom]]
![[Intelligence (stat)|Intelligence]]
![[Stamina (stat)|Stamina]]
|-
![[:Category:Dwarf|Dwarf]]
|10||8||8||10||12||10||10||12
|-
![[:Category:Elf|Elf]]
|8||12||12||12||8||10||10||8
|-
![[:Category:Elothean|Elothean]]
|8||12||10||10||10||12||12||6
|-
![[:Category:Gnome|Gnome]]
|4||14||12||10||10||10||14||6
|-
![[:Category:Gor'Tog|Gor'Tog]]
|16||8||10||10||10||6||6||14
|-
![[:Category:Halfling|Halfling]]
|6||12||14||10||8||8||10||12
|-
![[:Category:Human|Human]]
|10||10||10||10||10||10||10||10
|-
![[:Category:Kaldar|Kaldar]]
|12||10||10||12||10||8||8||10
|-
![[:Category:Prydaen|Prydaen]]
|10||14||10||12||8||6||10||10
|-
![[:Category:Rakash|Rakash]]
|10||12||8||10||12||8||6||14
|-
![[:Category:S'Kra Mur|S'Kra Mur]]
|12||12||10||10||10||8||8||10
|}


After character generation the only way to increase stats is by spending [[Time Development Points | TDPs]]. A character is given 600 TDPs to start. From then on TDPs are gained either by gaining circles or gaining skills.

==Racial Bonuses==
The racial TDP bonuses and penalties are listed in the following chart:

{| class="wikitable sortable"
|-
!
![[Strength (stat)|Strength]] 
![[Reflex (stat)|Reflex]]
![[Agility (stat)|Agility]]
![[Charisma (stat)|Charisma]]
![[Discipline (stat)|Discipline]]
![[Wisdom (stat)|Wisdom]]
![[Intelligence (stat)|Intelligence]]
![[Stamina (stat)|Stamina]]
|-
|[[Concept:Dwarves|Dwarf]]      ||  ||+1||+1||  ||-1||  ||  ||-1
|-
|[[Concept:Elves|Elf]]          ||+1||-1||-1||-1||+1||  ||  ||+1
|-
|[[Concept:Elotheans|Elothean]] ||+1||-1||  ||  ||  ||-1||-1||+2
|-
|[[Concept:Gnomes|Gnome]]       ||+3||-2||-1||  ||  ||  ||-2||+2
|-
|[[Concept:Gor'Togs|Gor'Tog]]   ||-3||+1||  ||  ||  ||+2||+2||-2
|-
|[[Concept:Halflings|Halfling]] ||+2||-1||-2||  ||+1||+1||  ||-1
|-
|[[Concept:Humans|Human]]       ||  ||  ||  ||  ||  ||  ||  ||
|-
|[[Concept:Kaldar|Kaldar]]      ||-1||  ||  ||-1||  ||+1||+1||
|-
|[[Concept:Prydaen|Prydaen]]    ||  ||-2||  ||-1||+1||+2||  ||
|-
|[[Concept:Rakash|Rakash]]      ||  ||-1||+1||  ||-1||+1||+2||-2
|-
|[[Concept:S'Kra Mur|S'Kra Mur]]||-1||-1||  ||  ||  ||+1||+1||
|-
|}

A negative number indicates a decrease in the cost to train and is therefore a bonus. A positive number indicates an increase in the cost to train and is therefore a penalty.

So for example: the cost to raise strength from 21 to 22 for a Gor'Tog character is: (21 x 3) + (-3 x (21 / 2)) = 33.

As with many other systems in the game, integer math is used for this calculation. 21 / 2 results in 10.

==TDP Project==

The {{com|TDP|TDP PROJECT}} command helps you determine how many TDPs are required to reach a certain level in an attribute. To use {{tt|TDP}} {{tt|PROJECT}}, please type {{tt|TDP}} {{tt|PROJECT}} {{tt|[attribute]}} {{tt|[goal]}}.  The goal must be greater than your current attribute.

''Example: tdp project wisdom 80''

==Stat Requirements for Joining Guilds==

In addition to the requirements below, a guildleader may not allow you to join if any of your stats are below 8. (This may be an issue for the following races: Gnomes, Elotheans, Gor'Togs, Halflings, Prydaen, Rakash.) If your stats are too low, you can spend TDPs to train them. Type {{com|Direction|dir [stat]}} for directions.

{|border="1" class="wikitable sortable"
|-
!Guild!!Stat1!!Stat2!!Stat3!!Stat4!!Stat5!!Stat6!!Stat7
|-
|[[Barbarian]]||strength: 10||stamina: 9||intelligence: 6||wisdom: 6||agility: 5||reflex: 5||charisma: 4
|-
|[[Bard]]||stamina: 8||agility: 8||strength: 8||intelligence: 7||wisdom: 7||reflex: 6||charisma: 6
|-
|[[Cleric]]||intelligence: 8||wisdom: 8||stamina: 7||agility: 7||reflex: 7||strength: 6||charisma: 5
|-
|[[Empath]]||stamina: 10||intelligence: 9||wisdom: 9||charisma: 6||strength: 5||reflex: 5||agility: 5
|-
|[[Moon Mage]]||wisdom: 9||intelligence: 8||agility: 7||charisma: 7||strength: 6||stamina: 6||reflex: 5
|-
|[[Paladin]]||strength: 9||charisma: 8||wisdom: 7||intelligence: 7||stamina: 7||reflex: 6||agility: 6
|-
|[[Ranger]]||strength: 8||stamina: 8||agility: 8||reflex: 7||intelligence: 7||charisma: 6||wisdom: 6
|-
|[[Thief]]||agility: 9||reflex: 9||strength: 8||stamina: 8||intelligence: 7||wisdom: 6||charisma: 5
|-
|[[Trader]]||intelligence: 9||wisdom: 9||charisma: 9||stamina: 7||strength: 5||reflex: 5||agility: 5
|-
|[[Warrior Mage]]||intelligence: 9||wisdom: 9||strength: 7||agility: 7||stamina: 6||reflex: 5||charisma: 5
|}

==TDP cost formulas for attributes==

The TDP formula uses a floor function because core GSL is integer math only.
[[Image:TDP_single_precise_formula.png]]
<br />
<blockquote>
<code>3|15</code>: 3 for stats < 100, 15 for stats 100+<br />
</blockquote>

If you would like to calculate the TDP cost of raising a stat from one value to the next (say from 60 to 75), The following formula may be helpful:

[[Image:TDP_sum_formula.png]]

Using this formula, the cost for a human to raise their strength from 60 to 75 would be (60+75-1)*(75-60)*(6+0)/4 = 3015 TDPs

For a Gor Tog to make the same advancement, they would require roughly 1507 TDPs (give or take one TDP)

==TDP cost to Train Table==

The following table shows how much TDPs it costs to train to a particular stat, for all racial bonuses.

{| class="wikitable" style="text-align: center;" width=500
|-
 ! Stat Level  !! -3 !! -2 !! -1 !! 0 !! 1 !! 2 !! 3
|-
| 5 || 9 || 11 || 13 || 15 || 17 || 19 || 21
|-
| 6 || 9 || 12 || 15 || 18 || 21 || 24 || 27
|-
| 7 || 12 || 15 || 18 || 21 || 24 || 27 || 30
|-
| 8 || 12 || 16 || 20 || 24 || 28 || 32 || 36
|-
| 9 || 15 || 19 || 23 || 27 || 31 || 35 || 39
|-
| 10 || 15 || 20 || 25 || 30 || 35 || 40 || 45
|-
| 11 || 18 || 23 || 28 || 33 || 38 || 43 || 48
|-
| 12 || 18 || 24 || 30 || 36 || 42 || 48 || 54
|-
| 13 || 21 || 27 || 33 || 39 || 45 || 51 || 57
|-
| 14 || 21 || 28 || 35 || 42 || 49 || 56 || 63
|-
| 15 || 24 || 31 || 38 || 45 || 52 || 59 || 66
|-
| 16 || 24 || 32 || 40 || 48 || 56 || 64 || 72
|-
| 17 || 27 || 35 || 43 || 51 || 59 || 67 || 75
|-
| 18 || 27 || 36 || 45 || 54 || 63 || 72 || 81
|-
| 19 || 30 || 39 || 48 || 57 || 66 || 75 || 84
|-
| 20 || 30 || 40 || 50 || 60 || 70 || 80 || 90
|-
| 21 || 33 || 43 || 53 || 63 || 73 || 83 || 93
|-
| 22 || 33 || 44 || 55 || 66 || 77 || 88 || 99
|-
| 23 || 36 || 47 || 58 || 69 || 80 || 91 || 102
|-
| 24 || 36 || 48 || 60 || 72 || 84 || 96 || 108
|-
| 25 || 39 || 51 || 63 || 75 || 87 || 99 || 111
|-
| 26 || 39 || 52 || 65 || 78 || 91 || 104 || 117
|-
| 27 || 42 || 55 || 68 || 81 || 94 || 107 || 120
|-
| 28 || 42 || 56 || 70 || 84 || 98 || 112 || 126
|-
| 29 || 45 || 59 || 73 || 87 || 101 || 115 || 129
|-
| 30 || 45 || 60 || 75 || 90 || 105 || 120 || 135
|-
| 31 || 48 || 63 || 78 || 93 || 108 || 123 || 138
|-
| 32 || 48 || 64 || 80 || 96 || 112 || 128 || 144
|-
| 33 || 51 || 67 || 83 || 99 || 115 || 131 || 147
|-
| 34 || 51 || 68 || 85 || 102 || 119 || 136 || 153
|-
| 35 || 54 || 71 || 88 || 105 || 122 || 139 || 156
|-
| 36 || 54 || 72 || 90 || 108 || 126 || 144 || 162
|-
| 37 || 57 || 75 || 93 || 111 || 129 || 147 || 165
|-
| 38 || 57 || 76 || 95 || 114 || 133 || 152 || 171
|-
| 39 || 60 || 79 || 98 || 117 || 136 || 155 || 174
|-
| 40 || 60 || 80 || 100 || 120 || 140 || 160 || 180
|-
| 41 || 63 || 83 || 103 || 123 || 143 || 163 || 183
|-
| 42 || 63 || 84 || 105 || 126 || 147 || 168 || 189
|-
| 43 || 66 || 87 || 108 || 129 || 150 || 171 || 192
|-
| 44 || 66 || 88 || 110 || 132 || 154 || 176 || 198
|-
| 45 || 69 || 91 || 113 || 135 || 157 || 179 || 201
|-
| 46 || 69 || 92 || 115 || 138 || 161 || 184 || 207
|-
| 47 || 72 || 95 || 118 || 141 || 164 || 187 || 210
|-
| 48 || 72 || 96 || 120 || 144 || 168 || 192 || 216
|-
| 49 || 75 || 99 || 123 || 147 || 171 || 195 || 219
|-
| 50 || 75 || 100 || 125 || 150 || 175 || 200 || 225
|-
| 51 || 78 || 103 || 128 || 153 || 178 || 203 || 228
|-
| 52 || 78 || 104 || 130 || 156 || 182 || 208 || 234
|-
| 53 || 81 || 107 || 133 || 159 || 185 || 211 || 237
|-
| 54 || 81 || 108 || 135 || 162 || 189 || 216 || 243
|-
| 55 || 84 || 111 || 138 || 165 || 192 || 219 || 246
|-
| 56 || 84 || 112 || 140 || 168 || 196 || 224 || 252
|-
| 57 || 87 || 115 || 143 || 171 || 199 || 227 || 255
|-
| 58 || 87 || 116 || 145 || 174 || 203 || 232 || 261
|-
| 59 || 90 || 119 || 148 || 177 || 206 || 235 || 264
|-
| 60 || 90 || 120 || 150 || 180 || 210 || 240 || 270
|-
| 61 || 93 || 123 || 153 || 183 || 213 || 243 || 273
|-
| 62 || 93 || 124 || 155 || 186 || 217 || 248 || 279
|-
| 63 || 96 || 127 || 158 || 189 || 220 || 251 || 282
|-
| 64 || 96 || 128 || 160 || 192 || 224 || 256 || 288
|-
| 65 || 99 || 131 || 163 || 195 || 227 || 259 || 291
|-
| 66 || 99 || 132 || 165 || 198 || 231 || 264 || 297
|-
| 67 || 102 || 135 || 168 || 201 || 234 || 267 || 300
|-
| 68 || 102 || 136 || 170 || 204 || 238 || 272 || 306
|-
| 69 || 105 || 139 || 173 || 207 || 241 || 275 || 309
|-
| 70 || 105 || 140 || 175 || 210 || 245 || 280 || 315
|-
| 71 || 108 || 143 || 178 || 213 || 248 || 283 || 318
|-
| 72 || 108 || 144 || 180 || 216 || 252 || 288 || 324
|-
| 73 || 111 || 147 || 183 || 219 || 255 || 291 || 327
|-
| 74 || 111 || 148 || 185 || 222 || 259 || 296 || 333
|-
| 75 || 114 || 151 || 188 || 225 || 262 || 299 || 336
|-
| 76 || 114 || 152 || 190 || 228 || 266 || 304 || 342
|-
| 77 || 117 || 155 || 193 || 231 || 269 || 307 || 345
|-
| 78 || 117 || 156 || 195 || 234 || 273 || 312 || 351
|-
| 79 || 120 || 159 || 198 || 237 || 276 || 315 || 354
|-
| 80 || 120 || 160 || 200 || 240 || 280 || 320 || 360
|-
| 81 || 123 || 163 || 203 || 243 || 283 || 323 || 363
|-
| 82 || 123 || 164 || 205 || 246 || 287 || 328 || 369
|-
| 83 || 126 || 167 || 208 || 249 || 290 || 331 || 372
|-
| 84 || 126 || 168 || 210 || 252 || 294 || 336 || 378
|-
| 85 || 129 || 171 || 213 || 255 || 297 || 339 || 381
|-
| 86 || 129 || 172 || 215 || 258 || 301 || 344 || 387
|-
| 87 || 132 || 175 || 218 || 261 || 304 || 347 || 390
|-
| 88 || 132 || 176 || 220 || 264 || 308 || 352 || 396
|-
| 89 || 135 || 179 || 223 || 267 || 311 || 355 || 399
|-
| 90 || 135 || 180 || 225 || 270 || 315 || 360 || 405
|-
| 91 || 138 || 183 || 228 || 273 || 318 || 363 || 408
|-
| 92 || 138 || 184 || 230 || 276 || 322 || 368 || 414
|-
| 93 || 141 || 187 || 233 || 279 || 325 || 371 || 417
|-
| 94 || 141 || 188 || 235 || 282 || 329 || 376 || 423
|-
| 95 || 144 || 191 || 238 || 285 || 332 || 379 || 426
|-
| 96 || 144 || 192 || 240 || 288 || 336 || 384 || 432
|-
| 97 || 147 || 195 || 243 || 291 || 339 || 387 || 435
|-
| 98 || 147 || 196 || 245 || 294 || 343 || 392 || 441
|-
| 99 || 150 || 199 || 248 || 297 || 346 || 395 || 444
|-
| 100 || 1350 || 1400 || 1450 || 1500 || 1550 || 1600 || 1650
|-
| 101 || 1365 || 1415 || 1465 || 1515 || 1565 || 1615 || 1665
|-
| 102 || 1377 || 1428 || 1479 || 1530 || 1581 || 1632 || 1683
|-
| 103 || 1392 || 1443 || 1494 || 1545 || 1596 || 1647 || 1698
|-
| 104 || 1404 || 1456 || 1508 || 1560 || 1612 || 1664 || 1716
|-
| 105 || 1419 || 1471 || 1523 || 1575 || 1627 || 1679 || 1731
|-
| 106 || 1431 || 1484 || 1537 || 1590 || 1643 || 1696 || 1749
|-
| 107 || 1446 || 1499 || 1552 || 1605 || 1658 || 1711 || 1764
|-
| 108 || 1458 || 1512 || 1566 || 1620 || 1674 || 1728 || 1782
|-
| 109 || 1473 || 1527 || 1581 || 1635 || 1689 || 1743 || 1797
|-
| 110 || 1485 || 1540 || 1595 || 1650 || 1705 || 1760 || 1815
|-
| 111 || 1500 || 1555 || 1610 || 1665 || 1720 || 1775 || 1830
|-
| 112 || 1512 || 1568 || 1624 || 1680 || 1736 || 1792 || 1848
|-
| 113 || 1527 || 1583 || 1639 || 1695 || 1751 || 1807 || 1863
|-
| 114 || 1539 || 1596 || 1653 || 1710 || 1767 || 1824 || 1881
|-
| 115 || 1554 || 1611 || 1668 || 1725 || 1782 || 1839 || 1896
|-
| 116 || 1566 || 1624 || 1682 || 1740 || 1798 || 1856 || 1914
|-
| 117 || 1581 || 1639 || 1697 || 1755 || 1813 || 1871 || 1929
|-
| 118 || 1593 || 1652 || 1711 || 1770 || 1829 || 1888 || 1947
|-
| 119 || 1608 || 1667 || 1726 || 1785 || 1844 || 1903 || 1962
|-
| 120 || 1620 || 1680 || 1740 || 1800 || 1860 || 1920 || 1980
|-
| 121 || 1635 || 1695 || 1755 || 1815 || 1875 || 1935 || 1995
|-
| 122 || 1647 || 1708 || 1769 || 1830 || 1891 || 1952 || 2013
|-
| 123 || 1662 || 1723 || 1784 || 1845 || 1906 || 1967 || 2028
|-
| 124 || 1674 || 1736 || 1798 || 1860 || 1922 || 1984 || 2046
|-
| 125 || 1689 || 1751 || 1813 || 1875 || 1937 || 1999 || 2061
|-
| 126 || 1701 || 1764 || 1827 || 1890 || 1953 || 2016 || 2079
|-
| 127 || 1716 || 1779 || 1842 || 1905 || 1968 || 2031 || 2094
|-
| 128 || 1728 || 1792 || 1856 || 1920 || 1984 || 2048 || 2112
|-
| 129 || 1743 || 1807 || 1871 || 1935 || 1999 || 2063 || 2127
|-
| 130 || 1755 || 1820 || 1885 || 1950 || 2015 || 2080 || 2145
|-
| 131 || 1770 || 1835 || 1900 || 1965 || 2030 || 2095 || 2160
|-
| 132 || 1782 || 1848 || 1914 || 1980 || 2046 || 2112 || 2178
|-
| 133 || 1797 || 1863 || 1929 || 1995 || 2061 || 2127 || 2193
|-
| 134 || 1809 || 1876 || 1943 || 2010 || 2077 || 2144 || 2211
|-
| 135 || 1824 || 1891 || 1958 || 2025 || 2092 || 2159 || 2226
|-
| 136 || 1836 || 1904 || 1972 || 2040 || 2108 || 2176 || 2244
|-
| 137 || 1851 || 1919 || 1987 || 2055 || 2123 || 2191 || 2259
|-
| 138 || 1863 || 1932 || 2001 || 2070 || 2139 || 2208 || 2277
|-
| 139 || 1878 || 1947 || 2016 || 2085 || 2154 || 2223 || 2292
|-
| 140 || 1890 || 1960 || 2030 || 2100 || 2170 || 2240 || 2310
|-
| 141 || 1905 || 1975 || 2045 || 2115 || 2185 || 2255 || 2325
|-
| 142 || 1917 || 1988 || 2059 || 2130 || 2201 || 2272 || 2343
|-
| 143 || 1932 || 2003 || 2074 || 2145 || 2216 || 2287 || 2358
|-
| 144 || 1944 || 2016 || 2088 || 2160 || 2232 || 2304 || 2376
|-
| 145 || 1959 || 2031 || 2103 || 2175 || 2247 || 2319 || 2391
|-
| 146 || 1971 || 2044 || 2117 || 2190 || 2263 || 2336 || 2409
|-
| 147 || 1986 || 2059 || 2132 || 2205 || 2278 || 2351 || 2424
|-
| 148 || 1998 || 2072 || 2146 || 2220 || 2294 || 2368 || 2442
|-
| 149 || 2013 || 2087 || 2161 || 2235 || 2309 || 2383 || 2457
|-
| 150 || 2025 || 2100 || 2175 || 2250 || 2325 || 2400 || 2475
|-
| 151 || 2040 || 2115 || 2190 || 2265 || 2340 || 2415 || 2490
|-
| 152 || 2052 || 2128 || 2204 || 2280 || 2356 || 2432 || 2508
|-
| 153 || 2067 || 2143 || 2219 || 2295 || 2371 || 2447 || 2523
|-
| 154 || 2079 || 2156 || 2233 || 2310 || 2387 || 2464 || 2541
|-
| 155 || 2094 || 2171 || 2248 || 2325 || 2402 || 2479 || 2556
|-
| 156 || 2106 || 2184 || 2262 || 2340 || 2418 || 2496 || 2574
|-
| 157 || 2121 || 2199 || 2277 || 2355 || 2433 || 2511 || 2589
|-
| 158 || 2133 || 2212 || 2291 || 2370 || 2449 || 2528 || 2607
|-
| 159 || 2148 || 2227 || 2306 || 2385 || 2464 || 2543 || 2622
|-
| 160 || 2160 || 2240 || 2320 || 2400 || 2480 || 2560 || 2640
|-
| 161 || 2175 || 2255 || 2335 || 2415 || 2495 || 2575 || 2655
|-
| 162 || 2187 || 2268 || 2349 || 2430 || 2511 || 2592 || 2673
|-
| 163 || 2202 || 2283 || 2364 || 2445 || 2526 || 2607 || 2688
|-
| 164 || 2214 || 2296 || 2378 || 2460 || 2542 || 2624 || 2706
|-
| 165 || 2229 || 2311 || 2393 || 2475 || 2557 || 2639 || 2721
|-
| 166 || 2241 || 2324 || 2407 || 2490 || 2573 || 2656 || 2739
|-
| 167 || 2256 || 2339 || 2422 || 2505 || 2588 || 2671 || 2754
|-
| 168 || 2268 || 2352 || 2436 || 2520 || 2604 || 2688 || 2772
|-
| 169 || 2283 || 2367 || 2451 || 2535 || 2619 || 2703 || 2787
|-
| 170 || 2295 || 2380 || 2465 || 2550 || 2635 || 2720 || 2805
|-
| 171 || 2310 || 2395 || 2480 || 2565 || 2650 || 2735 || 2820
|-
| 172 || 2322 || 2408 || 2494 || 2580 || 2666 || 2752 || 2838
|-
| 173 || 2337 || 2423 || 2509 || 2595 || 2681 || 2767 || 2853
|-
| 174 || 2349 || 2436 || 2523 || 2610 || 2697 || 2784 || 2871
|-
| 175 || 2364 || 2451 || 2538 || 2625 || 2712 || 2799 || 2886
|-
| 176 || 2376 || 2464 || 2552 || 2640 || 2728 || 2816 || 2904
|-
| 177 || 2391 || 2479 || 2567 || 2655 || 2743 || 2831 || 2919
|-
| 178 || 2403 || 2492 || 2581 || 2670 || 2759 || 2848 || 2937
|-
| 179 || 2418 || 2507 || 2596 || 2685 || 2774 || 2863 || 2952
|-
| 180 || 2430 || 2520 || 2610 || 2700 || 2790 || 2880 || 2970
|-
| 181 || 2445 || 2535 || 2625 || 2715 || 2805 || 2895 || 2985
|-
| 182 || 2457 || 2548 || 2639 || 2730 || 2821 || 2912 || 3003
|-
| 183 || 2472 || 2563 || 2654 || 2745 || 2836 || 2927 || 3018
|-
| 184 || 2484 || 2576 || 2668 || 2760 || 2852 || 2944 || 3036
|-
| 185 || 2499 || 2591 || 2683 || 2775 || 2867 || 2959 || 3051
|-
| 186 || 2511 || 2604 || 2697 || 2790 || 2883 || 2976 || 3069
|-
| 187 || 2526 || 2619 || 2712 || 2805 || 2898 || 2991 || 3084
|-
| 188 || 2538 || 2632 || 2726 || 2820 || 2914 || 3008 || 3102
|-
| 189 || 2553 || 2647 || 2741 || 2835 || 2929 || 3023 || 3117
|-
| 190 || 2565 || 2660 || 2755 || 2850 || 2945 || 3040 || 3135
|-
| 191 || 2580 || 2675 || 2770 || 2865 || 2960 || 3055 || 3150
|-
| 192 || 2592 || 2688 || 2784 || 2880 || 2976 || 3072 || 3168
|-
| 193 || 2607 || 2703 || 2799 || 2895 || 2991 || 3087 || 3183
|-
| 194 || 2619 || 2716 || 2813 || 2910 || 3007 || 3104 || 3201
|-
| 195 || 2634 || 2731 || 2828 || 2925 || 3022 || 3119 || 3216
|-
| 196 || 2646 || 2744 || 2842 || 2940 || 3038 || 3136 || 3234
|-
| 197 || 2661 || 2759 || 2857 || 2955 || 3053 || 3151 || 3249
|-
| 198 || 2673 || 2772 || 2871 || 2970 || 3069 || 3168 || 3267
|-
| 199 || 2688 || 2787 || 2886 || 2985 || 3084 || 3183 || 3282
|}

==Proportional Attribute Training Table==

The following table is a table of stat values, varying TDP cost and racial bonuses. It is meant as a reference for efficient proportional training. For example, a Gor'Tog investing proportionally at 60 TDPS would have 40 Strength, 30 Stamina, 20 (Agility, Charisma, and Discipline), 17 Reflex, and 15 (Wisdom and Intelligence).

{| class="wikitable" style="text-align: center;" width=500
|-
  ! TDP Cost
  ! -3
  ! -2
  ! -1
  ! 0
  ! +1
  ! +2
  ! +3
|-
|20
|13
|10
|8
|7
|6
|5
|4
|-
|25
|17
|12
|10
|8
|7
|6
|6
|-
|30
|20
|15
|12
|10
|9
|8
|7
|-
|35
|23
|18
|14
|12
|10
|9
|8
|-
|40
|27
|20
|16
|13
|11
|10
|9
|-
|45
|30
|22
|18
|15
|13
|11
|10
|-
|50
|33
|25
|20
|17
|14
|12
|11
|-
|55
|37
|28
|22
|18
|16
|14
|12
|-
|60
|40
|30
|24
|20
|17
|15
|13
|-
|65
|43
|32
|26
|22
|19
|16
|14
|-
|70
|47
|35
|28
|23
|20
|18
|16
|-
|75
|50
|38
|30
|25
|21
|19
|17
|-
|80
|53
|40
|32
|27
|23
|20
|18
|-
|85
|57
|42
|34
|28
|24
|21
|19
|-
|90
|60
|45
|36
|30
|26
|22
|20
|-
|95
|63
|48
|38
|32
|27
|24
|21
|-
|100
|67
|50
|40
|33
|29
|25
|22
|-
|105
|70
|52
|42
|35
|30
|26
|23
|-
|110
|73
|55
|44
|37
|31
|28
|24
|-
|115
|77
|58
|46
|38
|33
|29
|26
|-
|120
|80
|60
|48
|40
|34
|30
|27
|-
|125
|83
|62
|50
|42
|36
|31
|28
|-
|130
|87
|65
|52
|43
|37
|32
|29
|-
|135
|90
|68
|54
|45
|39
|34
|30
|-
|140
|93
|70
|56
|47
|40
|35
|31
|-
|145
|97
|72
|58
|48
|41
|36
|32
|-
|150
|100
|75
|60
|50
|43
|38
|33
|-
|155
|103
|78
|62
|52
|44
|39
|34
|-
|160
|107
|80
|64
|53
|46
|40
|36
|-
|165
|110
|82
|66
|55
|47
|41
|37
|-
|170
|113
|85
|68
|57
|49
|42
|38
|-
|175
|117
|88
|70
|58
|50
|44
|39
|-
|180
|120
|90
|72
|60
|51
|45
|40
|-
|185
|123
|92
|74
|62
|53
|46
|41
|-
|190
|127
|95
|76
|63
|54
|48
|42
|-
|195
|130
|98
|78
|65
|56
|49
|43
|-
|200
|133
|100
|80
|67
|57
|50
|44
|-
|205
|137
|102
|82
|68
|59
|51
|46
|-
|210
|140
|105
|84
|70
|60
|52
|47
|-
|215
|143
|108
|86
|72
|61
|54
|48
|-
|220
|147
|110
|88
|73
|63
|55
|49
|-
|225
|150
|112
|90
|75
|64
|56
|50
|-
|230
|153
|115
|92
|77
|66
|58
|51
|-
|235
|157
|118
|94
|78
|67
|59
|52
|-
|240
|160
|120
|96
|80
|69
|60
|53
|-
|245
|163
|122
|98
|82
|70
|61
|54
|-
|250
|167
|125
|100
|83
|71
|62
|56
|}
[[Category:Statistics|*]][[page type is::concept| ]]
{{RefAl}}