// ===== 기본 데이터베이스 =====
// 선수 형식: "이름|포지션|종합|특성"  특성: S=스피드 P=피지컬 T=테크닉 F=결정력 A=공중볼 V=시야/패스 D=수비 K=킥(프리킥/커브) E=체력
// 종합(OVR)과 포지션, 특성으로 33개 세부 능력치를 결정적으로(같은 이름이면 항상 같은 값) 생성합니다. 편집 후에는 편집한 값이 우선합니다.
(function (G) {
const STAT_KEYS = ['pace','accel','finishing','shotPower','longShots','positioning','volleys','penalties','vision','crossing','longPass','shortPass','freeKick','curve','dribbling','ballControl','agility','balance','reactions','marking','interceptions','slideTackle','standTackle','heading','jumping','stamina','strength','aggression','gkDiving','gkHandling','gkKicking','gkReflexes','gkPositioning'];
const STAT_LABELS = {pace:'속력',accel:'가속력',finishing:'골 결정력',shotPower:'슛 파워',longShots:'중거리 슛',positioning:'위치 선정',volleys:'발리슛',penalties:'페널티 킥',vision:'시야',crossing:'크로스',longPass:'긴 패스',shortPass:'짧은 패스',freeKick:'프리킥',curve:'커브',dribbling:'드리블',ballControl:'볼 컨트롤',agility:'민첩성',balance:'밸런스',reactions:'반응 속도',marking:'대인 수비',interceptions:'가로채기',slideTackle:'슬라이딩 태클',standTackle:'태클',heading:'헤더',jumping:'점프',stamina:'스태미너',strength:'몸싸움',aggression:'적극성',gkDiving:'GK 다이빙',gkHandling:'GK 핸들링',gkKicking:'GK 킥',gkReflexes:'GK 반응속도',gkPositioning:'GK 위치선정'};
const STAT_GROUPS = [
 ['속도',['pace','accel']],
 ['공격/슛',['finishing','shotPower','longShots','positioning','volleys','penalties']],
 ['패스',['vision','crossing','longPass','shortPass','freeKick','curve']],
 ['드리블/테크닉',['dribbling','ballControl','agility','balance','reactions']],
 ['수비',['marking','interceptions','slideTackle','standTackle']],
 ['피지컬',['heading','jumping','stamina','strength','aggression']],
 ['골키퍼',['gkDiving','gkHandling','gkKicking','gkReflexes','gkPositioning']]
];
const POSITIONS = ['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'];
const POS_LABEL = {GK:'GK',CB:'CB',LB:'LB',RB:'RB',DM:'DM',CM:'CM',AM:'AM',LW:'LW',RW:'RW',ST:'ST'};

// 포지션별 OVR 대비 오프셋 (STAT_KEYS 순서)
//            pac acc fin pow lon pos vol pen vis crs lpa spa fk  crv dri ctl agi bal rea mrk int sld tkl hed jmp sta str agg gkd gkh gkk gkr gkp
const T = {
 GK: [-35,-33,-60,-35,-55,-60,-60,-50,-30,-55,-25,-22,-55,-50,-50,-35,-30,-25,-8,-60,-55,-60,-60,-55,-15,-40,-15,-40,  1, -1, -6,  2,  0],
 CB: [-12,-14,-35,-8,-30,-30,-35,-25,-25,-25,-10,-6,-35,-30,-22,-12,-20,-10,-4,  2,  0,  1,  2,  0, -2, -6,  4,  0,-75,-75,-75,-75,-75],
 FB: [ 0,  2,-25,-12,-20,-15,-25,-25,-12, -2, -8, -4,-25,-15, -6, -6, -2, -4,-4, -4, -3, -2, -3,-14, -8,  4, -8, -6,-75,-75,-75,-75,-75],
 DM: [-12,-10,-18, -2, -6,-10,-20,-15, -4,-15,  0,  2,-12,-10, -8, -2,-12, -4,-2,  0,  2, -3,  0, -8, -6,  4,  0,  0,-75,-75,-75,-75,-75],
 CM: [-8, -6,-10, -2, -2, -2,-12,-10,  2, -6,  0,  3, -8, -4, -2,  1, -4, -4,-2,-12, -8,-15,-10,-14,-10,  4, -6, -6,-75,-75,-75,-75,-75],
 AM: [-4, -2, -2, -4,  0,  0, -6, -6,  4, -8, -6,  2, -4,  1,  3,  3,  2, -2,-2,-35,-30,-40,-35,-20,-16, -6,-14,-18,-75,-75,-75,-75,-75],
 W:  [ 5,  6, -4, -4, -6,  0, -8, -8, -2, -2,-12, -2, -8, -2,  4,  1,  4,  0,-2,-40,-35,-42,-40,-22,-14, -2,-16,-20,-75,-75,-75,-75,-75],
 ST: [ 0,  0,  1,  1, -4,  4,  0, -4,-10,-20,-20, -6,-20,-12, -2,  0, -4, -4, 0,-48,-40,-48,-44, -2, -2, -6,  0,-12,-75,-75,-75,-75,-75]
};
const TRAITS = {
 S:{pace:7,accel:7,agility:3}, P:{strength:8,balance:4,aggression:4,jumping:3,pace:-2}, T:{dribbling:5,ballControl:5,agility:4,curve:3},
 F:{finishing:4,positioning:3,volleys:3,penalties:3}, A:{heading:8,jumping:7,strength:3}, V:{vision:7,shortPass:4,longPass:6,curve:2},
 D:{marking:5,interceptions:5,standTackle:5,slideTackle:4}, K:{freeKick:10,curve:8,longShots:5,crossing:3}, E:{stamina:10,aggression:2}
};
function hash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function seeded(seed){let s=seed||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function tmplOf(pos){return pos==='LB'||pos==='RB'?'FB':(pos==='LW'||pos==='RW'?'W':pos);}
function genStats(name,pos,ovr,traits){
 const r=seeded(hash(name+'#'+pos)); const t=T[tmplOf(pos)]||T.CM; const s={};
 STAT_KEYS.forEach((k,i)=>{const noise=Math.round((r()+r()+r()-1.5)*5); s[k]=ovr+t[i]+noise;});
 for(const c of (traits||'')){const m=TRAITS[c]; if(m) for(const k in m) s[k]+=m[k];}
 // 고OVR 선수는 주요 능력치가 OVR보다 높게 형성되도록 약간 보정
 for(const k of STAT_KEYS){ s[k]=Math.max(20,Math.min(99,Math.round(s[k]))); }
 return s;
}
function parseSquad(text){
 if(!text||!text.trim()) return [];
 return text.trim().split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const [name,pos,ovr,tr]=l.split('|');return {name,pos,ovr:+ovr,traits:tr||''};});
}

const RAW = [
{league:'EPL',name:'잉글랜드 프리미어리그',teams:[
['ARS','아스널','#d81920','#ffffff',`David Raya|GK|87
Kepa Arrizabalaga|GK|79
William Saliba|CB|88|DS
Gabriel Magalhaes|CB|88|AP
Jurrien Timber|RB|84|D
Riccardo Calafiori|LB|82|T
Piero Hincapie|LB|82|D
Ben White|RB|81|E
Cristhian Mosquera|CB|78
Myles Lewis-Skelly|LB|77|T
Declan Rice|DM|88|EVK
Martin Zubimendi|DM|86|V
Martin Odegaard|AM|87|VT
Mikel Merino|CM|83|A
Eberechi Eze|AM|85|TK
Christian Norgaard|DM|79
Bukayo Saka|RW|88|TS
Noni Madueke|RW|81|S
Gabriel Martinelli|LW|82|S
Leandro Trossard|LW|81|T
Viktor Gyokeres|ST|86|PF
Kai Havertz|ST|82|A`],
['MCI','맨체스터 시티','#6cabdd','#1c2c5b',`Gianluigi Donnarumma|GK|88
James Trafford|GK|79
Ruben Dias|CB|86|D
Josko Gvardiol|CB|85|SD
John Stones|CB|81|V
Abdukodir Khusanov|CB|78|S
Nathan Ake|CB|80
Matheus Nunes|RB|79|E
Rayan Ait-Nouri|LB|81|T
Nico O'Reilly|LB|77
Rodri|DM|89|VD
Tijjani Reijnders|CM|84|E
Nico Gonzalez|DM|81
Mateo Kovacic|CM|82|T
Bernardo Silva|CM|85|TE
Phil Foden|AM|85|TK
Rayan Cherki|AM|83|TK
Jeremy Doku|LW|82|ST
Savinho|RW|80|S
Omar Marmoush|ST|82|SK
Erling Haaland|ST|91|FPA
Oscar Bobb|RW|74|T`],
['LIV','리버풀','#c8102e','#f6eb61',`Alisson Becker|GK|89
Giorgi Mamardashvili|GK|80
Virgil van Dijk|CB|89|AD
Ibrahima Konate|CB|84|PS
Jeremie Frimpong|RB|83|S
Milos Kerkez|LB|81|E
Andrew Robertson|LB|81|E
Joe Gomez|CB|79
Conor Bradley|RB|77|S
Giovanni Leoni|CB|74
Alexis Mac Allister|CM|86|V
Ryan Gravenberch|DM|85|T
Dominik Szoboszlai|CM|84|KE
Florian Wirtz|AM|88|TV
Curtis Jones|CM|79|T
Wataru Endo|DM|76|D
Mohamed Salah|RW|89|FS
Cody Gakpo|LW|83|K
Hugo Ekitike|ST|83|TS
Alexander Isak|ST|87|FT
Federico Chiesa|LW|78
Rio Ngumoha|LW|70|S`],
['CHE','첼시','#034694','#ffffff',`Robert Sanchez|GK|80
Filip Jorgensen|GK|75
Levi Colwill|CB|82|V
Trevoh Chalobah|CB|80
Wesley Fofana|CB|79|S
Benoit Badiashile|CB|77
Reece James|RB|84|K
Malo Gusto|RB|79|S
Marc Cucurella|LB|83|E
Jorrel Hato|LB|77
Moises Caicedo|DM|88|DE
Enzo Fernandez|CM|85|V
Romeo Lavia|DM|78
Andrey Santos|CM|74
Cole Palmer|AM|88|KT
Pedro Neto|LW|81|S
Joao Pedro|ST|81|T
Liam Delap|ST|78|P
Alejandro Garnacho|LW|80|S
Estevao|RW|80|T
Jamie Gittens|LW|76|S`],
['MUN','맨체스터 유나이티드','#da291c','#000000',`Senne Lammens|GK|78
Altay Bayindir|GK|72
Matthijs de Ligt|CB|81|A
Harry Maguire|CB|78|A
Leny Yoro|CB|77
Lisandro Martinez|CB|82|DV
Luke Shaw|LB|77
Diogo Dalot|RB|79|E
Noussair Mazraoui|RB|78
Patrick Dorgu|LB|76|S
Casemiro|DM|79|P
Manuel Ugarte|DM|77|D
Bruno Fernandes|AM|86|VK
Kobbie Mainoo|CM|77|T
Mason Mount|AM|77
Matheus Cunha|LW|82|T
Bryan Mbeumo|RW|82|F
Benjamin Sesko|ST|80|PA
Joshua Zirkzee|ST|75|T
Amad Diallo|RW|80|T`],
['TOT','토트넘 홋스퍼','#ffffff','#132257',`Guglielmo Vicario|GK|82
Antonin Kinsky|GK|73
Cristian Romero|CB|84|DP
Micky van de Ven|CB|84|S
Kevin Danso|CB|77|P
Radu Dragusin|CB|76
Pedro Porro|RB|81|K
Destiny Udogie|LB|78|S
Djed Spence|LB|75|S
Rodrigo Bentancur|DM|78
Yves Bissouma|DM|78
Joao Palhinha|DM|81|D
Pape Matar Sarr|CM|77|E
Lucas Bergvall|CM|74
James Maddison|AM|81|K
Xavi Simons|AM|82|T
Mohammed Kudus|RW|82|T
Brennan Johnson|RW|79|S
Wilson Odobert|LW|74
Dominic Solanke|ST|79
Richarlison|ST|77|A
Randal Kolo Muani|ST|78|S`],
['NEW','뉴캐슬 유나이티드','#241f20','#ffffff',`Nick Pope|GK|82
Aaron Ramsdale|GK|78
Sven Botman|CB|80|A
Fabian Schar|CB|79|V
Malick Thiaw|CB|79
Dan Burn|CB|77|A
Kieran Trippier|RB|77|K
Tino Livramento|RB|79|S
Lewis Hall|LB|78
Sandro Tonali|DM|84|E
Bruno Guimaraes|CM|86|V
Joelinton|CM|81|P
Joe Willock|CM|74
Lewis Miley|CM|70
Anthony Gordon|LW|83|S
Anthony Elanga|RW|79|S
Harvey Barnes|LW|76
Jacob Murphy|RW|77
Nick Woltemade|ST|80|T
Yoane Wissa|ST|79|F`],
['AVL','아스톤 빌라','#670e36','#95bfe5',`Emiliano Martinez|GK|85
Marco Bizot|GK|76
Ezri Konsa|CB|81|D
Pau Torres|CB|79|V
Tyrone Mings|CB|76|A
Matty Cash|RB|79|E
Lucas Digne|LB|77|K
Ian Maatsen|LB|77
Boubacar Kamara|DM|81|D
Youri Tielemans|CM|81|VK
John McGinn|CM|80|E
Amadou Onana|DM|79|P
Morgan Rogers|AM|82|PT
Ross Barkley|CM|75
Leon Bailey|RW|78|S
Emiliano Buendia|AM|76|T
Jadon Sancho|RW|77|T
Donyell Malen|ST|79|S
Ollie Watkins|ST|82|F
Evann Guessand|LW|75`],
['BHA','브라이튼','#0057b8','#ffffff',`Bart Verbruggen|GK|79
Jason Steele|GK|72
Jan Paul van Hecke|CB|79
Lewis Dunk|CB|77|V
Adam Webster|CB|76
Igor Julio|CB|76
Mats Wieffer|RB|76
Joel Veltman|RB|74
Ferdi Kadioglu|LB|77|T
Maxim De Cuyper|LB|74
Carlos Baleba|DM|80|P
Pascal Gross|CM|78|VK
Yasin Ayari|CM|75
Diego Gomez|CM|74
Jack Hinshelwood|CM|74
Kaoru Mitoma|LW|80|TS
Yankuba Minteh|RW|77|S
Georginio Rutter|AM|76|T
Danny Welbeck|ST|76
Brajan Gruda|AM|74
Stefanos Tzimas|ST|73
Charalampos Kostoulas|ST|73`],
['BRE','브렌트퍼드','#e30613','#ffffff',`Caoimhin Kelleher|GK|80
Hakon Valdimarsson|GK|70
Nathan Collins|CB|78|A
Sepp van den Berg|CB|76
Kristoffer Ajer|CB|75
Ethan Pinnock|CB|75|A
Michael Kayode|RB|75
Rico Henry|LB|74
Keane Lewis-Potter|LB|74
Mathias Jensen|CM|76|V
Vitaly Janelt|CM|75
Yehor Yarmoliuk|CM|74
Jordan Henderson|CM|74|V
Mikkel Damsgaard|AM|77|K
Dango Ouattara|LW|75|S
Kevin Schade|LW|75|S
Igor Thiago|ST|79|P
Fabio Carvalho|ST|74
Reiss Nelson|RW|73`],
['BOU','본머스','#da291c','#000000',`Djordje Petrovic|GK|79
Will Dennis|GK|68
Marcos Senesi|CB|78|V
Bafode Diakite|CB|74
James Hill|CB|73
Adrien Truffert|LB|75
Adam Smith|RB|75
Alex Jimenez|RB|74|S
Alex Scott|CM|78|T
Tyler Adams|DM|77|D
Ryan Christie|CM|76
Marcus Tavernier|AM|78|K
Justin Kluivert|AM|78|T
Antoine Semenyo|RW|82|SP
David Brooks|RW|74
Amine Adli|LW|74
Evanilson|ST|78
Eli Junior Kroupi|ST|74
Enes Unal|ST|72`],
['CRY','크리스탈 팰리스','#1b458f','#c4122e',`Dean Henderson|GK|81
Walter Benitez|GK|72
Marc Guehi|CB|84|D
Maxence Lacroix|CB|80|S
Chris Richards|CB|77
Jaydee Canvot|CB|72
Daniel Munoz|RB|82|E
Tyrick Mitchell|LB|75
Adam Wharton|CM|80|V
Daichi Kamada|AM|77
Will Hughes|DM|75
Jefferson Lerma|DM|75
Ismaila Sarr|RW|80|S
Yeremy Pino|LW|76|T
Jean-Philippe Mateta|ST|80|P
Eddie Nketiah|ST|74
Jorgen Strand Larsen|ST|76|A
Justin Devenny|AM|68`],
['EVE','에버턴','#003399','#ffffff',`Jordan Pickford|GK|83
Mark Travers|GK|70
James Tarkowski|CB|79|A
Jarrad Branthwaite|CB|79
Michael Keane|CB|76|A
Jake O'Brien|RB|76
Vitalii Mykolenko|LB|76
Nathan Patterson|RB|75
Idrissa Gueye|DM|77|D
James Garner|CM|77|K
Tim Iroegbunam|CM|72
Kiernan Dewsbury-Hall|CM|77
Jack Grealish|LW|80|T
Iliman Ndiaye|LW|79|T
Carlos Alcaraz|AM|75
Dwight McNeil|LW|76|K
Thierno Barry|ST|75|A
Beto|ST|74|P
Tyler Dibling|RW|72`],
['FUL','풀럼','#ffffff','#000000',`Bernd Leno|GK|81
Benjamin Lecomte|GK|70
Joachim Andersen|CB|78|V
Calvin Bassey|CB|76|P
Jorge Cuenca|CB|72
Kenny Tete|RB|76
Antonee Robinson|LB|77|S
Timothy Castagne|RB|75
Sasa Lukic|DM|76
Sander Berge|DM|77
Tom Cairney|CM|74
Andreas Pereira|AM|79|K
Emile Smith Rowe|AM|77
Alex Iwobi|RW|77
Harry Wilson|LW|77|K
Adama Traore|RW|75|SP
Kevin|LW|74
Raul Jimenez|ST|76
Rodrigo Muniz|ST|74`],
['LEE','리즈 유나이티드','#ffffff','#1d428a',`Lucas Perri|GK|76
Karl Darlow|GK|70
Joe Rodon|CB|75
Pascal Struijk|CB|75
Jaka Bijol|CB|76|A
Jayden Bogle|RB|72
Gabriel Gudmundsson|LB|73
James Justin|RB|73
Ethan Ampadu|DM|75|D
Anton Stach|CM|75|P
Ao Tanaka|CM|74
Sean Longstaff|CM|73
Brenden Aaronson|AM|73|E
Wilfried Gnonto|LW|74|S
Daniel James|RW|74|S
Noah Okafor|LW|75
Dominic Calvert-Lewin|ST|75|A
Lukas Nmecha|ST|74
Joel Piroe|ST|73`],
['NFO','노팅엄 포리스트','#dd0000','#ffffff',`Matz Sels|GK|80
Angus Gunn|GK|71
Murillo|CB|81|S
Nikola Milenkovic|CB|80|A
Moussa Niakhate|CB|74
Ola Aina|RB|76
Neco Williams|LB|75
Elliot Anderson|CM|82|E
Ibrahim Sangare|DM|76
Nicolas Dominguez|CM|75
Morgan Gibbs-White|AM|82|V
James McAtee|AM|74
Callum Hudson-Odoi|LW|77
Dan Ndoye|RW|78|S
Omari Hutchinson|RW|76
Chris Wood|ST|79|AF
Igor Jesus|ST|76
Arnaud Kalimuendo|ST|75`],
['SUN','선덜랜드','#eb172b','#ffffff',`Robin Roefs|GK|76
Anthony Patterson|GK|70
Omar Alderete|CB|74
Daniel Ballard|CB|72|A
Nordi Mukiele|CB|76
Reinildo Mandava|LB|75
Lutsharel Geertruida|RB|74
Trai Hume|RB|72
Granit Xhaka|DM|80|V
Noah Sadiki|CM|74
Enzo Le Fee|CM|75
Habib Diarra|AM|74
Dan Neil|CM|72
Simon Adingra|LW|74|S
Chemsdine Talbi|RW|74
Romaine Mundle|LW|72
Wilson Isidor|ST|74|S
Brian Brobbey|ST|74|P
Eliezer Mayenda|ST|70`],
['COV','코번트리 시티','#59cbe8','#ffffff',`Carl Rushworth|GK|72
Oliver Dovin|GK|68
Bobby Thomas|CB|72
Liam Kitching|CB|71
Luis Binks|CB|70
Jay Dasilva|LB|71
Joel Latibeaudiere|RB|70
Milan van Ewijk|RB|72
Matt Grimes|CM|73|V
Victor Torp|CM|72
Josh Eccles|CM|70
Frank Onyeka|DM|71
Jack Rudoni|AM|73
Tatsuhiro Sakamoto|RW|71
Ephron Mason-Clark|LW|71|S
Haji Wright|ST|74|F
Ellis Simms|ST|71
Brandon Thomas-Asante|ST|70`],
['IPS','입스위치 타운','#0044a9','#ffffff',`Christian Walton|GK|72
Alex Palmer|GK|71
Dara O'Shea|CB|73
Jacob Greaves|CB|72
Cedric Kipre|CB|71
Axel Tuanzebe|CB|70
Leif Davis|LB|74|K
Ben Johnson|RB|70
Azor Matusiwa|DM|72
Jens Cajuste|CM|72
Jack Taylor|CM|70
Marcelino Nunez|CM|71|K
Sammie Szmodics|AM|72
Conor Chaplin|AM|70
Jaden Philogene|LW|73|S
Jack Clarke|LW|72
Wes Burns|RW|70
George Hirst|ST|71
Chuba Akpom|ST|71
Ivan Azon|ST|70`],
['HUL','헐 시티','#f5971d','#000000',`Ivor Pandur|GK|71
Thimothee Lo-Tutala|GK|66
Charlie Hughes|CB|70
John Egan|CB|69
Semi Ajayi|CB|69
Ryan Giles|LB|71|K
Lewie Coyle|RB|68
Cody Drameh|RB|69
Regan Slater|CM|69
Amir Hadziahmetovic|DM|69
Eliot Matazo|DM|69
Kasey Palmer|AM|69
Mohamed Belloumi|RW|71|T
Abu Kamara|RW|70
Liam Millar|LW|69
Joe Gelhardt|ST|70
Oli McBurnie|ST|69
Kyle Joseph|ST|68`]
]},
{league:'LALIGA',name:'스페인 라리가',teams:[
['RMA','레알 마드리드','#ffffff','#febe10',`Thibaut Courtois|GK|89
Andriy Lunin|GK|78
Eder Militao|CB|84|S
Dean Huijsen|CB|82|V
Antonio Rudiger|CB|84|P
Alvaro Carreras|LB|81
Trent Alexander-Arnold|RB|85|VK
Dani Carvajal|RB|82
Ferland Mendy|LB|79|D
Aurelien Tchouameni|DM|85|D
Federico Valverde|CM|88|EK
Jude Bellingham|AM|88|P
Eduardo Camavinga|CM|83|T
Arda Guler|AM|82|K
Dani Ceballos|CM|78
Vinicius Junior|LW|89|ST
Rodrygo|RW|83|T
Kylian Mbappe|ST|91|SF
Franco Mastantuono|RW|75`],
['BAR','바르셀로나','#a50044','#004d98',`Joan Garcia|GK|83
Wojciech Szczesny|GK|80
Pau Cubarsi|CB|84|V
Ronald Araujo|CB|82|PS
Andreas Christensen|CB|79
Eric Garcia|CB|79
Alejandro Balde|LB|81|S
Jules Kounde|RB|85|D
Gerard Martin|LB|77
Pedri|CM|89|VT
Frenkie de Jong|CM|85|T
Marc Casado|DM|77
Gavi|CM|82|E
Dani Olmo|AM|83|T
Fermin Lopez|AM|80
Lamine Yamal|RW|90|TK
Raphinha|LW|87|SK
Marcus Rashford|LW|80|S
Robert Lewandowski|ST|85|F
Ferran Torres|ST|79`],
['ATM','아틀레티코 마드리드','#cb3524','#ffffff',`Jan Oblak|GK|87
Juan Musso|GK|76
Jose Maria Gimenez|CB|80|A
Robin Le Normand|CB|80
David Hancko|CB|79
Marcos Llorente|RB|82|E
Matteo Ruggeri|LB|77
Marc Pubill|CB|74
Koke|CM|80|V
Pablo Barrios|CM|81
Conor Gallagher|CM|79|E
Alex Baena|AM|83|K
Johnny Cardoso|DM|79
Giuliano Simeone|RW|78|E
Nico Gonzalez|LW|78
Thiago Almada|AM|79|K
Antoine Griezmann|ST|84|VK
Julian Alvarez|ST|86|FE
Alexander Sorloth|ST|80|A`]
]},
{league:'SERIEA',name:'이탈리아 세리에 A',teams:[
['INT','인테르','#0068a8','#000000',`Yann Sommer|GK|83
Josep Martinez|GK|74
Alessandro Bastoni|CB|86|V
Francesco Acerbi|CB|80
Manuel Akanji|CB|82
Stefan de Vrij|CB|79
Yann Bisseck|CB|77
Federico Dimarco|LB|84|K
Denzel Dumfries|RB|83|A
Nicolo Barella|CM|87|E
Hakan Calhanoglu|DM|85|VK
Henrikh Mkhitaryan|CM|79
Piotr Zielinski|CM|79
Davide Frattesi|CM|79
Lautaro Martinez|ST|88|F
Marcus Thuram|ST|84|P
Ange-Yoan Bonny|ST|75
Pio Esposito|ST|74`],
['NAP','나폴리','#12a0d7','#ffffff',`Vanja Milinkovic-Savic|GK|80
Alex Meret|GK|79
Alessandro Buongiorno|CB|82
Amir Rrahmani|CB|80
Sam Beukema|CB|77
Giovanni Di Lorenzo|RB|82|E
Mathias Olivera|LB|78
Leonardo Spinazzola|LB|75
Stanislav Lobotka|DM|84|V
Frank Anguissa|CM|82|P
Scott McTominay|CM|85|FE
Kevin De Bruyne|AM|86|VK
Billy Gilmour|CM|77
Matteo Politano|RW|79
David Neres|LW|79|T
Noa Lang|LW|78
Rasmus Hojlund|ST|79|S
Romelu Lukaku|ST|81|P`],
['JUV','유벤투스','#ffffff','#000000',`Michele Di Gregorio|GK|80
Mattia Perin|GK|76
Gleison Bremer|CB|84|D
Federico Gatti|CB|78|A
Pierre Kalulu|CB|79
Lloyd Kelly|CB|76
Andrea Cambiaso|LB|81
Juan Cabal|LB|75
Manuel Locatelli|DM|81|V
Khephren Thuram|CM|81|P
Weston McKennie|CM|78|E
Teun Koopmeiners|CM|80|K
Kenan Yildiz|LW|85|TK
Francisco Conceicao|RW|80|T
Edon Zhegrova|RW|79|T
Dusan Vlahovic|ST|82|F
Jonathan David|ST|81
Lois Openda|ST|79|S`],
['MIL','AC 밀란','#fb090b','#000000',`Mike Maignan|GK|86
Pietro Terracciano|GK|72
Fikayo Tomori|CB|79|S
Matteo Gabbia|CB|78
Strahinja Pavlovic|CB|77|P
Koni De Winter|CB|76
Pervis Estupinan|LB|77
Alexis Saelemaekers|RB|78
Davide Bartesaghi|LB|72
Luka Modric|CM|84|VK
Adrien Rabiot|CM|81|E
Youssouf Fofana|DM|78
Ruben Loftus-Cheek|CM|78
Samuele Ricci|DM|77
Ardon Jashari|CM|76
Christian Pulisic|RW|83|T
Rafael Leao|LW|84|ST
Christopher Nkunku|ST|80
Santiago Gimenez|ST|78`]
]},
{league:'BUNDES',name:'독일 분데스리가',teams:[
['FCB','바이에른 뮌헨','#dc052d','#ffffff',`Manuel Neuer|GK|85
Jonas Urbig|GK|74
Dayot Upamecano|CB|84|S
Jonathan Tah|CB|84|A
Kim Min-jae|CB|82|SP
Alphonso Davies|LB|82|S
Josip Stanisic|RB|78
Konrad Laimer|RB|80|E
Hiroki Ito|CB|78
Joshua Kimmich|DM|88|VK
Leon Goretzka|CM|81|P
Aleksandar Pavlovic|CM|80
Jamal Musiala|AM|88|T
Lennart Karl|AM|74
Michael Olise|RW|87|TK
Luis Diaz|LW|85|S
Serge Gnabry|RW|80
Harry Kane|ST|90|FVK
Nicolas Jackson|ST|80|S`],
['BVB','보루시아 도르트문트','#fde100','#000000',`Gregor Kobel|GK|85
Alexander Meyer|GK|70
Nico Schlotterbeck|CB|83|V
Waldemar Anton|CB|79
Niklas Sule|CB|78|P
Ramy Bensebaini|LB|76
Julian Ryerson|RB|78|E
Daniel Svensson|LB|74
Emre Can|DM|77|P
Felix Nmecha|CM|79|T
Marcel Sabitzer|CM|79|K
Julian Brandt|AM|80|V
Jobe Bellingham|CM|76
Karim Adeyemi|LW|79|S
Maximilian Beier|ST|79|S
Serhou Guirassy|ST|85|FA
Carney Chukwuemeka|AM|75`],
['B04','바이어 레버쿠젠','#e32221','#000000',`Mark Flekken|GK|79
Janis Blaswich|GK|76
Edmond Tapsoba|CB|81
Jarell Quansah|CB|78
Loic Bade|CB|77
Alejandro Grimaldo|LB|82|K
Arthur|RB|76|S
Robert Andrich|DM|79|P
Aleix Garcia|CM|77|V
Exequiel Palacios|CM|79
Malik Tillman|AM|79
Equi Fernandez|CM|76
Ernest Poku|RW|75
Jonas Hofmann|RW|76
Martin Terrier|LW|76
Claudio Echeverri|AM|75|T
Patrik Schick|ST|81|F
Christian Kofane|ST|72`]
]},
{league:'LIGUE1',name:'프랑스 리그 1',teams:[
['PSG','파리 생제르맹','#004170','#da291c',`Lucas Chevalier|GK|82
Matvey Safonov|GK|78
Marquinhos|CB|85|V
Willian Pacho|CB|84|D
Lucas Beraldo|CB|77
Achraf Hakimi|RB|88|S
Nuno Mendes|LB|87|S
Vitinha|CM|89|V
Joao Neves|DM|86|E
Fabian Ruiz|CM|84|K
Warren Zaire-Emery|CM|81
Senny Mayulu|CM|74
Ousmane Dembele|RW|89|ST
Khvicha Kvaratskhelia|LW|88|T
Desire Doue|RW|84|T
Bradley Barcola|LW|82|S
Goncalo Ramos|ST|78|F
Lee Kang-in|AM|79|K`],
['OM','올랭피크 마르세유','#2faee0','#ffffff',`Geronimo Rulli|GK|81
Jeffrey de Lange|GK|70
Leonardo Balerdi|CB|80
Nayef Aguerd|CB|78
Facundo Medina|CB|77
Benjamin Pavard|CB|79
Emerson Palmieri|LB|76
Amir Murillo|RB|76
Pierre-Emile Hojbjerg|DM|80|V
Matt O'Riley|CM|78
Geoffrey Kondogbia|DM|75
Angel Gomes|CM|74
Arthur Vermeeren|CM|73
Mason Greenwood|RW|82|FK
Igor Paixao|LW|75
Amine Gouiri|ST|78
Pierre-Emerick Aubameyang|ST|78`]
]}
];

// ===== 타 리그 추가 구단 (2026-27). 실명은 주요 선수만, 나머지는 가상 선수로 채움 =====
const EXTRA = {
LALIGA: [
['ATH','아틀레틱 빌바오','#ee2523','#ffffff',76,`Unai Simon|GK|84
Dani Vivian|CB|80|A
Aitor Paredes|CB|76
Yuri Berchiche|LB|76
Jesus Areso|RB|76
Mikel Jauregizar|DM|77
Benat Prados|CM|76
Mikel Vesga|CM|75
Oihan Sancet|AM|82|T
Unai Gomez|AM|74
Nico Williams|LW|85|ST
Inaki Williams|RW|80|SP
Alex Berenguer|LW|77
Gorka Guruzeta|ST|77|A`],
['BET','레알 베티스','#00954c','#ffffff',76,`Alvaro Valles|GK|77
Diego Llorente|CB|77
Marc Bartra|CB|76
Natan|CB|76
Ricardo Rodriguez|LB|76
Hector Bellerin|RB|75
Sofyan Amrabat|DM|78|D
Marc Roca|DM|77
Pablo Fornals|CM|77
Isco|AM|82|VT
Giovani Lo Celso|AM|80|K
Antony|RW|80|T
Abde Ezzalzouli|LW|79|S
Cucho Hernandez|ST|79`],
['CEL','셀타 비고','#8ac3ee','#ffffff',74,`Ivan Villar|GK|74
Carl Starfelt|CB|75
Marcos Alonso|CB|75|K
Javi Rodriguez|CB|72
Oscar Mingueza|RB|76
Ilaix Moriba|CM|76|P
Fran Beltran|CM|75
Bryan Zaragoza|LW|76|S
Williot Swedberg|LW|74
Iago Aspas|ST|78|KF
Borja Iglesias|ST|77|A`],
['DEP','데포르티보 라코루냐','#1b5bab','#ffffff',71,`Yeremay Hernandez|LW|77|T
Mario Soriano|AM|74
Lucas Perez|ST|72|K`],
['ELC','엘체','#04883d','#ffffff',72,`Matias Dituro|GK|73
Pedro Bigas|CB|72
Marc Aguado|CM|73
German Valera|RW|73
Rafa Mir|ST|74
Andre Silva|ST|75|F
Alvaro Rodriguez|ST|72`],
['ESP','에스파뇰','#007fc8','#ffffff',72,`Marko Dmitrovic|GK|76
Leandro Cabrera|CB|75
Omar El Hilali|RB|74
Carlos Romero|LB|74
Pol Lozano|DM|73
Edu Exposito|CM|75|K
Pere Milla|AM|73
Javi Puado|ST|75
Roberto Fernandez|ST|73`],
['GET','헤타페','#005999','#ffffff',72,`David Soria|GK|77
Djene|CB|76|D
Domingos Duarte|CB|74|A
Juan Iglesias|RB|73
Diego Rico|LB|73
Mauro Arambarri|CM|77|E
Luis Milla|CM|76|V
Borja Mayoral|ST|75`],
['LEV','레반테','#b4053f','#004f9f',71,`Pablo Martinez|CM|71
Carlos Alvarez|AM|74|T
Roger Brugue|RW|72
Ivan Romero|ST|72`],
['MAG','말라가','#1d6fb8','#ffffff',69,``],
['OSA','오사수나','#d91a21','#0a346f',73,`Sergio Herrera|GK|76
Alejandro Catena|CB|76|A
Jorge Herrando|CB|73
Abel Bretones|LB|74
Lucas Torro|DM|76
Jon Moncayola|CM|75|E
Aimar Oroz|AM|76
Ruben Garcia|LW|75
Victor Munoz|LW|75|S
Kike Barja|RW|73
Ante Budimir|ST|79|AF`],
['RAC','라싱 산탄데르','#00804a','#ffffff',69,`Inigo Vicente|AM|73|K
Andres Martin|RW|73
Juan Carlos Arana|ST|72`],
['RAY','라요 바예카노','#ffffff','#e31b23',73,`Augusto Batalla|GK|76
Florian Lejeune|CB|76|A
Pep Chavarria|LB|74
Andrei Ratiu|RB|76|E
Pathe Ciss|DM|76|P
Oscar Valentin|DM|75
Unai Lopez|CM|75
Isi Palazon|AM|77|K
Jorge de Frutos|RW|76|S
Alvaro Garcia|LW|76|S
Sergio Camello|ST|74
Alemao|ST|73`],
['RSO','레알 소시에다드','#0067b1','#ffffff',76,`Alex Remiro|GK|82
Igor Zubeldia|CB|78
Aritz Elustondo|CB|74
Jon Martin|CB|73
Aihen Munoz|LB|74
Sergio Gomez|LB|76|K
Jon Aramburu|RB|75
Jon Gorrotxategi|DM|74
Benat Turrientes|CM|75
Carlos Soler|CM|77|K
Brais Mendez|AM|79|V
Takefusa Kubo|RW|81|T
Ander Barrenetxea|LW|77
Mikel Oyarzabal|ST|81|F
Orri Oskarsson|ST|75`],
['SEV','세비야','#ffffff','#d4021d',73,`Orjan Nyland|GK|75
Tanguy Nianzou|CB|75
Kike Salas|CB|74
Jose Angel Carmona|RB|75
Nemanja Gudelj|DM|75
Lucien Agoume|CM|75
Djibril Sow|CM|75
Ruben Vargas|LW|76
Chidera Ejuke|LW|75|T
Isaac Romero|ST|74
Akor Adams|ST|74|P
Alexis Sanchez|ST|74`],
['VAL','발렌시아','#ffffff','#000000',73,`Julen Agirrezabala|GK|75
Stole Dimitrievski|GK|75
Mouctar Diakhaby|CB|75|A
Cesar Tarrega|CB|75
Jose Gaya|LB|77
Dimitri Foulquier|RB|72
Pepelu|DM|76|K
Javi Guerra|CM|77|E
Andre Almeida|AM|74
Diego Lopez|LW|76
Luis Rioja|RW|74
Hugo Duro|ST|75
Dani Raba|ST|73`],
['VIL','비야레알','#ffe667','#005187',78,`Luiz Junior|GK|78
Arnau Tenas|GK|74
Juan Foyth|CB|79
Rafa Marin|CB|77
Logan Costa|CB|77
Renato Veiga|CB|77
Sergi Cardona|LB|76
Santiago Mourino|RB|75
Thomas Partey|DM|79|P
Pape Gueye|DM|78
Dani Parejo|CM|78|VK
Santi Comesana|CM|77
Alberto Moleiro|AM|79|T
Tajon Buchanan|RW|77|S
Nicolas Pepe|RW|78|K
Gerard Moreno|ST|79|F
Ayoze Perez|ST|79
Georges Mikautadze|ST|78`],
['ALA','알라베스','#0063af','#ffffff',71,`Antonio Sivera|GK|76
Facundo Garces|CB|74
Jon Pacheco|CB|73
Jonny Otto|RB|72
Victor Parada|LB|71
Antonio Blanco|DM|74
Ander Guevara|CM|73
Carlos Vicente|RW|74
Abde Rebbach|LW|72
Toni Martinez|ST|74
Lucas Boye|ST|74|P`]
],
SERIEA: [
['ATA','아탈란타','#1e71b8','#000000',79,`Marco Carnesecchi|GK|82
Isak Hien|CB|79|P
Berat Djimsiti|CB|77
Odilon Kossounou|CB|77
Sead Kolasinac|CB|76
Raoul Bellanova|RB|77|S
Davide Zappacosta|RB|76
Nicola Zalewski|LB|75
Marten de Roon|DM|78|E
Ederson|CM|81|EP
Mario Pasalic|AM|78
Lazar Samardzic|AM|77|K
Charles De Ketelaere|AM|82|T
Ademola Lookman|LW|82|S
Gianluca Scamacca|ST|78|A
Nikola Krstovic|ST|78`],
['BOL','볼로냐','#1a2f48','#a21c26',77,`Lukasz Skorupski|GK|79
Jhon Lucumi|CB|79
Nicolo Casale|CB|75
Juan Miranda|LB|76
Emil Holm|RB|75
Remo Freuler|DM|78
Lewis Ferguson|CM|79|E
Nikola Moro|CM|75
Jens Odgaard|AM|75
Riccardo Orsolini|RW|80|K
Federico Bernardeschi|RW|76|K
Jonathan Rowe|LW|75|S
Santiago Castro|ST|77
Thijs Dallinga|ST|75`],
['CAG','칼리아리','#a51f2a','#0c2d53',71,`Elia Caprile|GK|76
Yerry Mina|CB|75|A
Sebastiano Luperto|CB|73
Gabriele Zappa|RB|72
Michel Adopo|CM|72
Gianluca Gaetano|AM|74
Mattia Felici|LW|71
Sebastiano Esposito|ST|74
Leonardo Pavoletti|ST|70|A`],
['COM','코모','#1b3f8b','#ffffff',76,`Jean Butez|GK|77
Diego Carlos|CB|77
Marc-Oliver Kempf|CB|75
Alberto Moreno|LB|75
Ivan Smolcic|RB|74
Maximo Perrone|CM|77|V
Lucas Da Cunha|CM|76
Nico Paz|AM|82|TK
Assane Diao|RW|76|S
Jesus Rodriguez|LW|75|T
Alvaro Morata|ST|77
Anastasios Douvikas|ST|75`],
['FIO','피오렌티나','#5b2b8a','#ffffff',77,`David de Gea|GK|83
Pietro Comuzzo|CB|76
Luca Ranieri|CB|76
Marin Pongracic|CB|75
Robin Gosens|LB|77|A
Fabiano Parisi|LB|74
Dodo|RB|78|S
Rolando Mandragora|CM|77|K
Nicolo Fagioli|CM|77|V
Simon Sohm|CM|75
Albert Gudmundsson|AM|79|K
Moise Kean|ST|81|SF
Edin Dzeko|ST|75|A`],
['FRO','프로시노네','#ffd600','#1a3a8a',68,``],
['GEN','제노아','#a1182a','#0b1e46',72,`Nicola Leali|GK|74
Johan Vasquez|CB|76
Alessandro Marcandalli|CB|72
Aaron Martin|LB|74
Morten Frendrup|CM|77|E
Ruslan Malinovskyi|AM|75|K
Junior Messias|RW|74
Vitinha|ST|74
Lorenzo Colombo|ST|73`],
['LAZ','라치오','#87d8f7','#ffffff',77,`Ivan Provedel|GK|80
Alessio Romagnoli|CB|78
Mario Gila|CB|79
Nuno Tavares|LB|77|S
Adam Marusic|RB|75
Nicolo Rovella|DM|78|V
Matteo Guendouzi|CM|79|E
Toma Basic|CM|74
Mattia Zaccagni|LW|79|T
Gustav Isaksen|RW|76
Pedro|RW|74|T
Taty Castellanos|ST|78
Boulaye Dia|ST|76`],
['LEC','레체','#ffd700','#c8102e',70,`Wladimiro Falcone|GK|78
Kialonda Gaspar|CB|73
Tiago Gabriel|CB|72
Antonino Gallo|LB|73
Ylber Ramadani|DM|72
Lassana Coulibaly|CM|73
Riccardo Sottil|RW|72
Nikola Stulic|ST|72`],
['MZA','몬차','#e30613','#ffffff',68,``],
['PAR','파르마','#ffd200','#0b1e46',72,`Zion Suzuki|GK|77
Alessandro Circati|CB|74
Enrico Delprato|CB|73
Emanuele Valeri|LB|73
Mandela Keita|CM|73
Adrian Bernabe|CM|75|T
Pontus Almqvist|RW|72
Mateo Pellegrino|ST|74|A
Patrick Cutrone|ST|73`],
['ROM','AS 로마','#8e1f2f','#f0bc42',79,`Mile Svilar|GK|84
Gianluca Mancini|CB|79|A
Evan Ndicka|CB|79
Mario Hermoso|CB|76
Angelino|LB|77
Wesley|RB|76|S
Zeki Celik|RB|75
Bryan Cristante|DM|77
Manu Kone|CM|81|E
Neil El Aynaoui|CM|76
Lorenzo Pellegrini|AM|77|K
Paulo Dybala|AM|79|TK
Matias Soule|RW|79|T
Stephan El Shaarawy|LW|74
Artem Dovbyk|ST|78|A
Evan Ferguson|ST|76`],
['SAS','사수올로','#00a752','#000000',71,`Arijanet Muric|GK|75
Kristian Thorstvedt|CM|74
Domenico Berardi|RW|79|K
Armand Lauriente|LW|76|S
Andrea Pinamonti|ST|75`],
['TOR','토리노','#8a1538','#ffffff',73,`Alberto Paleari|GK|72
Saul Coco|CB|75|A
Guillermo Maripan|CB|75
Ardian Ismajli|CB|73
Valentino Lazaro|RB|72
Marcus Pedersen|RB|72
Gvidas Gineitis|CM|73
Cesare Casadei|CM|75
Nikola Vlasic|AM|77
Che Adams|ST|76
Duvan Zapata|ST|74|P
Giovanni Simeone|ST|74`],
['UDI','우디네세','#000000','#ffffff',72,`Maduka Okoye|GK|76
Thomas Kristensen|CB|74
Oumar Solet|CB|76|S
Christian Kabasele|CB|72
Hassane Kamara|LB|73
Jesper Karlstrom|DM|74
Jakub Piotrowski|CM|73
Arthur Atta|CM|74
Nicolo Zaniolo|AM|74
Keinan Davis|ST|74|P`],
['VEN','베네치아','#ff6a13','#0d6a3a',68,``]
],
BUNDES: [
['RBL','RB 라이프치히','#dd0741','#ffffff',78,`Peter Gulacsi|GK|79
Maarten Vandevoordt|GK|77
Willi Orban|CB|79|A
Castello Lukeba|CB|79|S
El Chadaille Bitshiabu|CB|74
David Raum|LB|79|K
Ridle Baku|RB|76
Nicolas Seiwald|DM|77
Xaver Schlager|CM|79|E
Assan Ouedraogo|AM|74
Christoph Baumgartner|AM|79
Antonio Nusa|LW|78|ST
Yan Diomande|RW|76|S
Romulo|ST|75
Conrad Harder|ST|74`],
['VFB','VfB 슈투트가르트','#e32219','#ffffff',78,`Alexander Nubel|GK|81
Jeff Chabot|CB|77|A
Finn Jeltsch|CB|75
Maximilian Mittelstadt|LB|79
Josha Vagnoman|RB|75
Angelo Stiller|DM|82|V
Atakan Karazor|DM|76
Chema Andres|CM|75
Bilal El Khannouss|AM|78|T
Jamie Leweling|RW|78|S
Chris Fuhrich|LW|77
Deniz Undav|ST|80|F
Ermedin Demirovic|ST|79`],
['SGE','아인트라흐트 프랑크푸르트','#e1000f','#000000',77,`Kaua Santos|GK|77
Robin Koch|CB|79
Arthur Theate|CB|78
Nathaniel Brown|LB|76|S
Rasmus Kristensen|RB|76
Ellyes Skhiri|DM|77
Hugo Larsson|CM|78|E
Can Uzun|AM|77|K
Mario Gotze|AM|76|V
Fares Chaibi|AM|76
Ritsu Doan|RW|77
Ansgar Knauff|RW|75|S
Jonathan Burkardt|ST|79|F`],
['TSG','TSG 호펜하임','#1c63b7','#ffffff',74,`Oliver Baumann|GK|80
Ozan Kabak|CB|75
Kevin Akpoguma|CB|73
Vladimir Coufal|RB|74
Bernardo|LB|72
Grischa Promel|CM|74
Leon Avdullahu|CM|73
Bazoumana Toure|LW|74|S
Andrej Kramaric|ST|78|K
Fisnik Asllani|ST|75
Adam Hlozek|ST|74
Tim Lemperle|ST|74`],
['FCU','1. FC 우니온 베를린','#eb1923','#ffffff',73,`Frederik Ronnow|GK|77
Danilho Doekhi|CB|77|A
Diogo Leite|CB|76
Leopold Querfeld|CB|74
Christopher Trimmel|RB|72|K
Robert Skov|LB|72
Rani Khedira|DM|76
Andras Schafer|CM|74
Janik Haberer|CM|73
Benedict Hollerbach|RW|74
Ilyas Ansah|ST|73
Andrej Ilic|ST|73
Oliver Burke|ST|72|S`],
['SCF','SC 프라이부르크','#e2001a','#000000',75,`Noah Atubolu|GK|78
Matthias Ginter|CB|78
Philipp Lienhart|CB|77
Lukas Kubler|RB|74
Christian Gunter|LB|75
Nicolas Hofler|DM|73
Maximilian Eggestein|CM|76
Patrick Osterhage|CM|74
Johan Manzambi|CM|75
Yuito Suzuki|AM|75
Vincenzo Grifo|LW|77|K
Derry Scherhant|RW|73
Igor Matanovic|ST|74
Lucas Holer|ST|73|E`],
['M05','마인츠 05','#c3141e','#ffffff',73,`Robin Zentner|GK|75
Dominik Kohr|CB|74
Stefan Bell|CB|72
Danny da Costa|RB|72
Phillipp Mwene|LB|73
Kaishu Sano|DM|76|E
Nadiem Amiri|CM|77|K
Lee Jae-sung|AM|75|E
Paul Nebel|AM|74
Armindo Sieb|ST|72
Nelson Weiper|ST|72`],
['BMG','묀헨글라트바흐','#ffffff','#000000',74,`Moritz Nicolas|GK|76
Nico Elvedi|CB|77
Ko Itakura|CB|77
Joe Scally|RB|74
Lukas Ullrich|LB|73
Julian Weigl|DM|76|V
Rocco Reitz|CM|76
Florian Neuhaus|CM|75
Kevin Stoger|AM|76|K
Franck Honorat|RW|76
Robin Hack|LW|75
Haris Tabakovic|ST|75|A
Shuto Machino|ST|74`],
['SVW','베르더 브레멘','#1d9053','#ffffff',73,`Mio Backhaus|GK|74
Marco Friedl|CB|75
Niklas Stark|CB|74
Mitchell Weiser|RB|75
Felix Agu|LB|72
Senne Lynen|DM|75
Jens Stage|CM|76
Romano Schmid|AM|76
Leonardo Bittencourt|AM|72
Marco Grull|LW|73
Justin Njinmah|ST|73|S
Keke Topp|ST|71`],
['FCA','FC 아우크스부르크','#ba3733','#ffffff',72,`Finn Dahmen|GK|76
Jeffrey Gouweleeuw|CB|74
Chrislain Matsima|CB|74
Cedric Zesiger|CB|73
Dimitrios Giannoulis|LB|74
Marius Wolf|RB|72
Kristijan Jakic|DM|74
Elvis Rexhbecaj|CM|73
Alexis Claude-Maurice|AM|75
Fredrik Jensen|AM|72
Phillip Tietz|ST|73|A
Samuel Essende|ST|72`],
['KOE','1. FC 쾰른','#ed1c24','#ffffff',71,`Marvin Schwabe|GK|74
Timo Hubers|CB|73
Dominique Heintz|CB|71
Eric Martel|DM|74
Florian Kainz|AM|72
Linton Maina|LW|73|S
Jakub Kaminski|LW|74
Said El Mala|LW|75|T
Marius Bulter|ST|72
Ragnar Ache|ST|72`],
['HSV','함부르크 SV','#0a3f86','#ffffff',71,`Daniel Heuer Fernandes|GK|74
Dennis Hadzikadunic|CB|72
Miro Muheim|LB|72
Jonas Meffert|DM|72
Nicolai Remberg|CM|72
Albert Sambi Lokonga|CM|73
Fabio Vieira|AM|75|K
Jean-Luc Dompe|LW|73
Ransford Konigsdorffer|ST|73|S
Robert Glatzel|ST|71|A`],
['S04','샬케 04','#004d9d','#ffffff',70,`Loris Karius|GK|72
Kenan Karaman|ST|72`],
['SVE','SV 엘버스베르크','#000000','#ffffff',68,``],
['SCP','SC 파더보른','#005ca9','#000000',68,``]
],
LIGUE1: [
['ANG','앙제 SCO','#000000','#ffffff',69,``],
['AUX','AJ 오세르','#0063a8','#ffffff',70,`Donovan Leon|GK|73
Gabriel Osho|CB|72
Lassine Sinayoko|ST|74`],
['BRS','스타드 브레스투아','#e30613','#ffffff',72,`Radoslaw Majecki|GK|74
Kenny Lala|RB|72
Bradley Locko|LB|72
Hugo Magnetti|CM|72
Kamory Doumbia|AM|73
Romain Del Castillo|RW|75|K
Ludovic Ajorque|ST|74|A`],
['HAC','르 아브르 AC','#0f3f8c','#8dc6eb',69,`Arouna Sangante|CB|70
Abdoulaye Toure|CM|71`],
['LMF','르망 FC','#e30613','#ffd200',67,``],
['RCL','RC 랑스','#ffd200','#e30613',75,`Robin Risser|GK|76
Malang Sarr|CB|74
Jonathan Gradit|CB|74
Adrien Thomasson|CM|76|E
Andy Diouf|CM|75
Florian Thauvin|RW|77|K
Wesley Said|LW|74
Odsonne Edouard|ST|74`],
['LIL','LOSC 릴','#e01e13','#1d2a58',76,`Berke Ozer|GK|76
Aissa Mandi|CB|75
Thomas Meunier|RB|74
Romain Perraud|LB|74
Benjamin Andre|DM|77|D
Ayyoub Bouaddi|CM|76
Hakon Arnar Haraldsson|AM|78|V
Osame Sahraoui|LW|75|T
Matias Fernandez-Pardo|RW|75
Hamza Igamane|ST|75
Olivier Giroud|ST|74|A`],
['FCL','FC 로리앙','#f47920','#000000',68,``],
['OL','올랭피크 리옹','#ffffff','#1b3a8b',76,`Dominik Greif|GK|76
Clinton Mata|CB|75
Nicolas Tagliafico|LB|76
Ainsley Maitland-Niles|RB|74
Orel Mangala|DM|76
Tanner Tessmann|CM|75
Corentin Tolisso|CM|77|K
Pavel Sulc|AM|76
Malick Fofana|LW|78|ST
Ernest Nuamah|RW|75|S
Afonso Moreira|LW|73
Martin Satriano|ST|73`],
['ASM','AS 모나코','#e7202e','#ffffff',77,`Philipp Kohn|GK|77
Thilo Kehrer|CB|77
Mohammed Salisu|CB|77
Eric Dier|CB|76
Vanderson|RB|78|S
Caio Henrique|LB|77|K
Denis Zakaria|DM|78|P
Lamine Camara|CM|77
Paul Pogba|CM|75|V
Aleksandr Golovin|AM|78|K
Takumi Minamino|AM|76
Maghnes Akliouche|RW|79|T
Ansu Fati|LW|75
Folarin Balogun|ST|77
Mika Biereth|ST|76|F`],
['NIC','OGC 니스','#c8102e','#000000',74,`Yehvann Diouf|GK|74
Dante|CB|74
Jonathan Clauss|RB|76|K
Melvin Bard|LB|74
Morgan Sanson|CM|73
Tom Louchet|CM|72
Sofiane Diop|LW|77
Jeremie Boga|LW|76|T
Mohamed-Ali Cho|RW|74
Terem Moffi|ST|76`],
['PFC','파리 FC','#1d3a6e','#c8102e',71,`Obed Nkambadio|GK|70
Maxime Lopez|CM|74|V
Ilan Kebbal|AM|76|T
Jean-Philippe Krasso|ST|73
Pierre-Yves Hamel|ST|70`],
['REN','스타드 렌','#e13327','#000000',74,`Brice Samba|GK|79
Jeremy Jacquet|CB|75
Lilian Brassier|CB|74
Przemyslaw Frankowski|RB|74
Seko Fofana|CM|76|P
Valentin Rongier|CM|76
Ludovic Blas|AM|76|K
Mousa Al-Tamari|RW|75
Esteban Lepaul|ST|75
Breel Embolo|ST|75|P`],
['RCS','RC 스트라스부르','#0f64b4','#ffffff',75,`Mike Penders|GK|74
Andrew Omobamidele|CB|74
Guela Doue|RB|76|S
Valentin Barco|LB|75
Felix Lemarechal|CM|74
Sebastian Nanasi|LW|76
Diego Moreira|LW|76|S
Emanuel Emegha|ST|76|P
Joaquin Panichelli|ST|74`],
['TFC','툴루즈 FC','#5f2a84','#ffffff',71,`Guillaume Restes|GK|76
Charlie Cresswell|CB|73
Rasmus Nicolaisen|CB|73
Mark McKenzie|CB|73
Cristian Casseres|CM|73
Yann Gboho|AM|74
Aron Donnum|RW|73
Frank Magri|ST|72`],
['TRO','ESTAC 트루아','#0055a4','#ffffff',67,``]
]
};
const LANG = { LALIGA: 'es', SERIEA: 'it', BUNDES: 'de', LIGUE1: 'fr', EPL: 'en' };
const NAMES = {
 es: [['Alvaro','Pablo','Sergio','Javier','Daniel','Adrian','Hugo','Ivan','Marcos','Ruben','Diego','Carlos','Raul','Mario','Oscar','Jorge','Alejandro','Victor','Miguel','Andres','Iker','Unai','Asier','Nacho'],['Garcia','Martinez','Lopez','Sanchez','Perez','Gomez','Ruiz','Diaz','Moreno','Munoz','Romero','Navarro','Torres','Dominguez','Vazquez','Ramos','Gil','Serrano','Molina','Ortega','Castro','Rubio','Marin','Sanz','Iglesias','Medina','Garrido','Cortes','Santos','Lozano']],
 it: [['Lorenzo','Matteo','Alessandro','Andrea','Davide','Federico','Luca','Marco','Simone','Riccardo','Tommaso','Gabriele','Nicolo','Francesco','Stefano','Pietro','Daniele','Filippo','Edoardo','Giacomo'],['Rossi','Russo','Ferrari','Esposito','Bianchi','Romano','Colombo','Ricci','Marino','Greco','Bruno','Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo','Lombardi','Moretti','Barbieri','Fontana','Santoro','Mariani','Rinaldi','Caruso','Ferrara','Galli','Martini','Leone']],
 de: [['Lukas','Jonas','Leon','Finn','Felix','Paul','Niklas','Tim','Jan','Moritz','Luca','Max','Julian','Tom','Nico','Fabian','Simon','Philipp','Marvin','Jannik'],['Muller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann','Koch','Richter','Klein','Wolf','Schroder','Neumann','Schwarz','Zimmermann','Braun','Kruger','Hofmann','Hartmann','Lange','Werner','Krause','Lehmann','Kohler','Maier','Kaiser','Fuchs']],
 fr: [['Lucas','Hugo','Theo','Nathan','Mathis','Enzo','Louis','Maxime','Clement','Antoine','Yanis','Baptiste','Romain','Alexis','Bilal','Kylian','Mehdi','Rayan','Quentin','Adrien','Moussa','Ibrahima'],['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier','Morel','Girard','Diallo','Traore','Kone','Camara','Mendy','Fofana','Sissoko','Bamba']],
 en: [['James','Jack','Harry','Oliver','George','Charlie','Thomas','Alfie','Joe','Ben','Lewis','Ryan','Callum','Jordan','Kieran','Sam','Luke','Connor','Mason','Tyler'],['Smith','Jones','Taylor','Brown','Williams','Wilson','Johnson','Davies','Robinson','Wright','Thompson','Evans','Walker','White','Roberts','Green','Hall','Wood','Jackson','Clarke','Hughes','Edwards','Turner','Hill','Moore','Cooper','Ward','Morris','King','Baker']]
};
const SQUAD_TMPL = { GK: 2, CB: 4, LB: 1, RB: 1, DM: 2, CM: 3, AM: 1, LW: 1, RW: 1, ST: 2 };
const GEN_TRAITS = { GK: '', CB: 'DAP', LB: 'SE', RB: 'SE', DM: 'DE', CM: 'VE', AM: 'TV', LW: 'ST', RW: 'ST', ST: 'FAP' };
// 명단을 포지션 템플릿(18명)까지 가상 선수로 채움. 같은 팀 ID면 항상 같은 선수가 생성됨
function fillSquad(teamId, players, base, lang) {
  const r = seeded(hash('squad#' + teamId)); const [F, Lst] = NAMES[lang] || NAMES.en;
  const have = {}; for (const p of players) have[p.pos] = (have[p.pos] || 0) + 1;
  const used = new Set(players.map(p => p.name)); let gi = 0;
  for (const pos of Object.keys(SQUAD_TMPL)) {
    for (let k = have[pos] || 0; k < SQUAD_TMPL[pos]; k++) {
      let name, tries = 0; do { name = F[Math.floor(r() * F.length)] + ' ' + Lst[Math.floor(r() * Lst.length)]; } while (used.has(name) && tries++ < 50);
      used.add(name);
      const ovr = Math.round(base - 3 + r() * 5 - (k >= 1 ? 1.5 : 0) - (pos === 'GK' && k >= 1 ? 3 : 0));
      const tr = r() < .5 ? (GEN_TRAITS[pos] || '').charAt(Math.floor(r() * (GEN_TRAITS[pos] || ' ').length)) : '';
      players.push({ id: teamId + '_g' + (gi++), name, pos, ovr, traits: tr, gen: true, stats: genStats(name, pos, ovr, tr) });
    }
  }
  return players;
}
function genSquad(teamId, base, lang) { return fillSquad(teamId, [], base, lang || 'en'); }

function eplPlayers(id){
 const E=G.EPL_DATA; if(!E||!E.teams[id]) return null;
 return E.teams[id].map(([code,name,pos,ovr,traits,adj])=>{const st=genStats(name,pos,ovr,traits);for(const k in adj){st[k]=st[k]+adj[k];}
  // 실제 기록 보정은 능력치의 모양만 바꾸고 종합 수준은 유지
  for(let it=0;it<3;it++){const d=calcOvr(st,pos)-ovr;if(Math.abs(d)<.5)break;for(const k in st){if(pos==='GK'?k.startsWith('gk')||k==='reactions':!k.startsWith('gk'))st[k]-=d;}}
  for(const k in st)st[k]=Math.max(20,Math.min(99,Math.round(st[k])));
  return {id:'EPL_'+code,name,pos,ovr,traits,stats:st};});
}
// FC27 데이터베이스(data_fc27.js)로 실축 리그·친선 모드 DB 구성. 키·몸무게는 자료가 없어 비워 둠
const FC_EPOCH = Date.UTC(2000, 0, 1);
function fcRefDay(){ const F=G.FC27; if(!F) return null; const [y,m,d]=F.date.split('-').map(Number); return Math.round((Date.UTC(y,m-1,d)-FC_EPOCH)/864e5); }
function buildDefaultDB(){
 const F=G.FC27; if(!F) return legacyDB();
 const W=G.FMWORLD; const db={version:'fc27', ref:F.date, leagues:[]};
 const teams={};
 for(const c of F.clubs) teams[c[0]]={id:c[0],name:c[1],short:c[2],color1:c[3],color2:c[4],nation:c[5],en:c[6],players:[]};
 const fk=F.famk, K=F.stats;
 for(const r of F.P){
  const [fid,name,pos0,bits,ci,nat,ft,wf,sm,dd,ptb,fo,val,st]=r; const t=teams[F.clubs[ci][0]];
  const stats={}; for(let j=0;j<K.length;j++) stats[K[j]]=Math.max(1,Math.min(99,st.charCodeAt(j)-32));
  const pos=POSITIONS.includes(pos0)?pos0:'CM';
  const fam={_:1}; fk.forEach((k,j)=>{ if(bits&(1<<j)) fam[k]=3; });
  if(fam.LB&&!fam.LWB) fam.LWB=2; if(fam.RB&&!fam.RWB) fam.RWB=2; if(fam.LW&&!fam.LM) fam.LM=2; if(fam.RW&&!fam.RM) fam.RM=2; if(fam.LM&&!fam.LW) fam.LW=2; if(fam.RM&&!fam.RW) fam.RW=2; fam[pos]=3;
  const pt=[]; for(let i=0;i<17;i++) if(ptb&(1<<i)) pt.push(i);
  const by=new Date(FC_EPOCH+dd*864e5).getUTCFullYear();
  t.players.push({id:'f'+fid,name,pos,ovr:fo,traits:'',stats,fam,pt,dob:dd,by,sm,val,bio:{nat:W?W.natName(nat):nat,natCode:nat,foot:ft==='L'?'왼발':'오른발',weak:wf||3,height:null,weight:null,est:false}});
 }
 // 인원이 적거나 골키퍼가 없는 구단은 가상 선수로 보충 ('가상' 표시)
 for(const id in teams){ const t=teams[id]; const n=t.players.length, gk=t.players.filter(p=>p.pos==='GK').length;
  if(n<16||!gk){ const ov=t.players.map(p=>calcOvr(p.stats,p.pos)).sort((a,b)=>b-a).slice(0,11); const base=ov.length?Math.round(ov.reduce((a,b)=>a+b,0)/ov.length)-4:60;
   const lang=(W&&W.NATIONS[t.nation]&&W.NATIONS[t.nation][1])||'en'; fillSquad(id,t.players,base,lang); for(const p of t.players) if(p.gen&&!p.bio) p.bio={nat:W?W.natName(t.nation):'',foot:'오른발',weak:3,height:null,weight:null,est:false}; } }
 for(const L of F.leagues) db.leagues.push({id:L.id,name:L.name,nation:L.nation,tier:L.tier,teams:L.clubs.map(id=>teams[id])});
 db.leagues.push({id:'OTHER',name:'기타 구단',other:1,teams:F.other.map(([id])=>teams[id])});
 return db;
}
// (이전 데이터) FC27 파일이 없을 때만 사용
function legacyDB(){
 const db={version:4,leagues:[]};
 for(const L of RAW){
  const lg={id:L.league,name:L.name,teams:[]};
  const all=L.teams.concat(EXTRA[L.league]||[]);
  for(const row of all){
   const [id,name,c1,c2]=row; const base=typeof row[4]==='number'?row[4]:null; const sq=base!=null?row[5]:row[4];
   let players=L.league==='EPL'?eplPlayers(id):null;
   if(!players){
    players=parseSquad(sq||'').map((p,i)=>({id:id+'_'+i,name:p.name,pos:p.pos,ovr:p.ovr,traits:p.traits,stats:genStats(p.name,p.pos,p.ovr,p.traits)}));
    if(base!=null) fillSquad(id,players,base,LANG[L.league]);
   }
   lg.teams.push({id,name,short:id,color1:c1,color2:c2,players});
  }
  db.leagues.push(lg);
 }
 return db;
}
// 선수 신상 정보 (키·몸무게·주발·약발·국적). 데이터에 없으면 포지션과 능력치로 추정하고 est 표시
const NAT = { es: '스페인', it: '이탈리아', de: '독일', fr: '프랑스', en: '잉글랜드' };
// 실축 모드 나이는 시즌 기준 연도(2026)와 출생연도로 계산
const REAL_YEAR = 2026;
function bioOf(p, lang){
 const base = bioBase(p, lang);
 const kb = (G.EPL_BIO || {})[p.name];
 const W = G.FMWORLD;
 let by = p.by || (kb && kb[0]) || null, ageEst = false;
 const ref = fcRefDay();
 if (p.dob != null && ref != null) return Object.assign({}, base, { by, age: Math.floor((ref - p.dob) / 365.25), ageEst: false });
 if (!by) { const r = seeded(hash('age#' + p.id + p.name)); const o = calcOvr(p.stats, p.pos); by = REAL_YEAR - Math.round(Math.max(18, Math.min(35, 26 + (o - 75) * .12 + (r() + r() + r() - 1.5) * 4.5))); ageEst = true; }
 const out = Object.assign({}, base, { by, age: REAL_YEAR - by, ageEst });
 if (!(p.bio && p.bio.nat) && kb && kb[1] && W) { out.nat = W.natName(kb[1]); out.natEst = false; }
 return out;
}
function bioBase(p, lang){
 if(p.bio) return p.bio;
 const r=seeded(hash('bio#'+p.id+p.name)); const s=p.stats; const pos=p.pos;
 const hb={GK:190,CB:187,LB:178,RB:178,DM:182,CM:179,AM:176,LW:175,RW:175,ST:183}[pos]||180;
 const height=Math.round(hb+(s.heading+s.jumping-140)*.09+(s.strength-70)*.05-(s.agility-70)*.05+(r()+r()+r()-1.5)*5);
 const weight=Math.round(height-104+(s.strength-70)*.18+(r()-.5)*6);
 const leftBias={LB:.6,LW:.45,RW:.35}[pos]||.22;
 const foot=r()<leftBias?'왼발':'오른발';
 const weak=Math.max(1,Math.min(5,Math.round(2.4+(s.ballControl+s.dribbling-150)*.02+(r()-.5)*1.6)));
 return {height,weight,foot,weak,nat:p.gen?(NAT[lang]||''):'',est:true};
}
// 포지션 기준 종합능력치 계산 (편집 후 표시용)
const OVR_W = {
 GK:{gkDiving:1,gkHandling:1,gkKicking:.4,gkReflexes:1.2,gkPositioning:1,reactions:.4},
 CB:{marking:1.2,standTackle:1.1,slideTackle:.8,interceptions:1,heading:.8,strength:.7,jumping:.4,reactions:.5,shortPass:.3,pace:.3},
 FB:{pace:.8,accel:.5,stamina:.6,crossing:.7,marking:.8,standTackle:.8,interceptions:.6,shortPass:.5,dribbling:.4,reactions:.4},
 DM:{interceptions:1,standTackle:.9,marking:.8,shortPass:.9,longPass:.6,vision:.5,strength:.5,stamina:.5,ballControl:.5,reactions:.5},
 CM:{shortPass:1.1,vision:.9,longPass:.7,ballControl:.8,dribbling:.6,stamina:.5,interceptions:.4,longShots:.3,reactions:.6},
 AM:{vision:1,shortPass:1,ballControl:.9,dribbling:.9,agility:.5,finishing:.5,longShots:.5,reactions:.6,curve:.3},
 W:{pace:.9,accel:.8,dribbling:1.1,ballControl:.8,crossing:.6,agility:.6,finishing:.5,shortPass:.5,reactions:.4},
 ST:{finishing:1.3,positioning:1,shotPower:.6,heading:.5,ballControl:.6,dribbling:.4,pace:.5,accel:.4,reactions:.6,strength:.3}
};
// ===== 위치별 능력치 (포지션 세분화 + 성향 유형) =====
// 자리 코드 → 공식: 좌우는 같은 공식(주발은 역할 수행에서 자연히 드러남)
OVR_W.WB={pace:.8,accel:.6,stamina:.9,crossing:.9,dribbling:.6,shortPass:.5,marking:.5,standTackle:.5,interceptions:.5,ballControl:.4};
OVR_W.WM={stamina:.8,crossing:.8,shortPass:.8,dribbling:.7,pace:.7,ballControl:.6,vision:.5,interceptions:.4,accel:.4,standTackle:.3};
const POS_T={GK:'GK',CB:'CB',LB:'FB',RB:'FB',LWB:'WB',RWB:'WB',DM:'DM',CM:'CM',LM:'WM',RM:'WM',AM:'AM',LW:'W',RW:'W',ST:'ST'};
const POS_TN={GK:'골키퍼',CB:'센터백',FB:'풀백',WB:'윙백',DM:'수비형 미드필더',CM:'중앙 미드필더',WM:'측면 미드필더',AM:'공격형 미드필더',W:'윙어',ST:'스트라이커'};
// 성향 유형: [id, 이름, 엔진 역할, 가중치] — 같은 포지션이라도 강점이 다른 여러 유형이 모두 높은 점수를 받을 수 있도록
const ARCH={
 GK:[['gk','슛스토퍼','gk',{gkReflexes:3,gkDiving:3,gkHandling:2,gkPositioning:2,reactions:1}],['sk','스위퍼 키퍼','sk',{gkPositioning:2,gkKicking:2.5,reactions:2,pace:1,accel:1,gkDiving:1,shortPass:1}]],
 CB:[['cd','센터백','cd',{marking:2.5,standTackle:2,interceptions:2,heading:1.5,reactions:1.5}],['stp','스토퍼','stp',{strength:2.5,aggression:2,standTackle:2,heading:2,jumping:1.5,slideTackle:1}],['bpd','볼 플레잉 디펜더','bpd',{shortPass:2,longPass:2,ballControl:1.5,vision:1,interceptions:1.5,marking:1.5}],['cov','커버형 센터백','cd',{pace:2,accel:1.5,interceptions:2,reactions:2,marking:1.5,slideTackle:1}]],
 FB:[['fbd','수비형 풀백','fb',{marking:2,standTackle:2,interceptions:1.5,strength:1,stamina:1,pace:1}],['fba','공격형 풀백','wb',{pace:2,stamina:2,crossing:2.5,accel:1,dribbling:1}],['ifb','인버티드 풀백','ifb',{shortPass:2,vision:1.5,ballControl:1.5,interceptions:1.5,marking:1,stamina:1}]],
 WB:[['wb','윙백','wb',{pace:2,stamina:2.5,crossing:2.5,dribbling:1,marking:1}],['cwb','컴플리트 윙백','cwb',{crossing:2,dribbling:2,ballControl:1.5,pace:1.5,stamina:1.5,vision:1}],['dwb','수비형 윙백','fb',{marking:2,standTackle:2,stamina:2,pace:1.5,interceptions:1.5}]],
 DM:[['anc','앵커','anc',{interceptions:2.5,marking:2,standTackle:1.5,reactions:1.5,heading:1,strength:1}],['dlp','딥라잉 플레이메이커','dlp',{shortPass:2.5,longPass:2.5,vision:2,ballControl:1.5,interceptions:1}],['bwm','볼위닝 미드필더','bwm',{aggression:2,standTackle:2.5,stamina:2,strength:1.5,slideTackle:1,interceptions:1}]],
 CM:[['b2b','박스투박스','b2b',{stamina:2.5,standTackle:1.5,longShots:1.5,shortPass:1,strength:1,accel:1,interceptions:1}],['cm','중앙 미드필더','cm',{shortPass:2,ballControl:1.5,vision:1.5,interceptions:1,stamina:1,longPass:1}],['mez','메짤라','mez',{dribbling:2,ballControl:2,longShots:1.5,agility:1.5,shortPass:1,accel:1}],['dlpc','딥라잉 플레이메이커','dlp',{shortPass:2.5,longPass:2.5,vision:2.5,ballControl:1.5}]],
 WM:[['wm','와이드 미드필더','wm',{stamina:2.5,crossing:2,shortPass:1.5,standTackle:1,interceptions:1,pace:1}],['wmw','측면 윙어','wng',{pace:2,crossing:2.5,dribbling:2,accel:1.5}],['wap','와이드 플레이메이커','ap',{vision:2.5,shortPass:2,ballControl:2,crossing:1,curve:1}]],
 AM:[['am','공격형 미드필더','am',{vision:1.5,shortPass:1.5,longShots:1.5,finishing:1,ballControl:1.5,dribbling:1}],['ap','어드밴스드 플레이메이커','ap',{vision:2.5,shortPass:2.5,ballControl:2,agility:1}],['ss','섀도 스트라이커','ss',{finishing:2,positioning:2,accel:1.5,reactions:1.5,dribbling:1}],['eng','엔간체','eng',{vision:2.5,ballControl:2.5,shortPass:2,balance:1}]],
 W:[['wng','윙어','wng',{pace:2.5,accel:1.5,crossing:2.5,dribbling:2}],['inf','인사이드 포워드','inf',{finishing:2,dribbling:2,accel:1.5,longShots:1,positioning:1,curve:1}],['inw','인버티드 윙어','inw',{dribbling:2,shortPass:1.5,vision:1.5,curve:1.5,crossing:1,agility:1}]],
 ST:[['af','어드밴스드 포워드','af',{pace:2,accel:2,finishing:2,positioning:1.5,dribbling:1}],['tm','타깃맨','tm',{heading:2.5,strength:2.5,jumping:2,finishing:1.5,positioning:1}],['poa','포쳐','poa',{finishing:3,positioning:2.5,reactions:2,accel:1}],['f9','폴스 나인','f9',{ballControl:2,vision:2,shortPass:2,dribbling:1.5,finishing:1}],['pf','프레싱 포워드','pf',{stamina:2,aggression:2,accel:1.5,finishing:1.5,strength:1}]]
};
const ARCH_SHARE=.5; // 위치 능력치 = 기본 공식 50% + 가장 잘 맞는 성향 유형 50%
const SKX={}; STAT_KEYS.forEach((k,i)=>{SKX[k]=i;});
const normW=w=>{let t=0;for(const k in w)t+=w[k];return Object.keys(w).map(k=>[k,SKX[k],w[k]/t]);};
const BASE_N={}, ARCH_N={};
for(const t in OVR_W) BASE_N[t]=normW(OVR_W[t]);
for(const t in ARCH) ARCH_N[t]=ARCH[t].map(([id,n,role,w])=>({id,n,role,w:normW(w)}));
const posT=pos=>POS_T[pos]||tmplOf(pos);
// 유형별 보정: 그 포지션의 '평균적인' 선수에게서 각 유형 점수가 같은 수준이 되도록 (특정 유형만 유리하지 않게)
const ARCH_ADJ={};
for(const t in ARCH_N){const off=T[t]||T[t==='WB'?'FB':t==='WM'?'W':'CM'];const typ=STAT_KEYS.map((k,i)=>70+off[i]);
 let base=0;for(const [k,i,x] of (BASE_N[t]||BASE_N.CM)) base+=typ[i]*x;
 ARCH_ADJ[t]={};for(const a of ARCH_N[t]){let v=0;for(const [k,i,x] of a.w) v+=typ[i]*x;ARCH_ADJ[t][a.id]=v-base;}}
// get(k, i): 능력치 이름·인덱스로 값을 돌려주는 함수
function rateT(get,t){
 const bw=BASE_N[t]||BASE_N.CM; let base=0; for(const [k,i,x] of bw) base+=get(k,i)*x;
 const adj=ARCH_ADJ[t]||{}; const archs=(ARCH_N[t]||[]).map(a=>{let v=0;for(const [k,i,x] of a.w) v+=get(k,i)*x; return {id:a.id,n:a.n,role:a.role,v:v-(adj[a.id]||0)};}).sort((a,b)=>b.v-a.v);
 const best=archs.length?archs[0].v:base;
 return {r:base*(1-ARCH_SHARE)+best*ARCH_SHARE, base, archs};
}
const getObj=st=>(k)=>st[k]??50, getArr=s=>(k,i)=>s[i]??50;
function rateObj(stats,pos){return rateT(getObj(stats),posT(pos));}
function rateArr(s,pos){return rateT(getArr(s),posT(pos));}
function calcOvr(stats,pos){return Math.round(rateObj(stats,pos).r);}
// 그 템플릿에서 지금 적용되는 능력치별 가중치 (기본 공식 + 최적 유형)
function effW(get,t){const R=rateT(get,t);const m={};for(const [k,i,x] of (BASE_N[t]||BASE_N.CM)) m[i]=(m[i]||0)+x*(1-ARCH_SHARE);const a=(ARCH_N[t]||[]).find(a=>a.id===(R.archs[0]||{}).id);if(a) for(const [k,i,x] of a.w) m[i]=(m[i]||0)+x*ARCH_SHARE;return m;}
const TMPL_LIST=['GK','CB','FB','WB','DM','CM','WM','AM','W','ST'];

G.FMDATA={effW,TMPL_LIST,getArr,getObj,POS_T,POS_TN,ARCH,rateT,rateObj,rateArr,posT,T_OFF:T,OVR_W,REAL_YEAR,bioOf,NAT,LANG,genSquad,fillSquad,STAT_KEYS,STAT_LABELS,STAT_GROUPS,POSITIONS,POS_LABEL,genStats,buildDefaultDB,fcRefDay,calcOvr,tmplOf,hash,seeded};
})(typeof window!=='undefined'?window:globalThis);
