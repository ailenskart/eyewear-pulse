export type Brand = {
  id: number;
  name: string;
  handle: string;
  category: 'Luxury' | 'D2C' | 'Sports' | 'Fast Fashion' | 'Independent' | 'Heritage' | 'Streetwear' | 'Sustainable' | 'Tech' | 'Kids' | 'Celebrity';
  region: 'North America' | 'Europe' | 'Asia Pacific' | 'South Asia' | 'Middle East' | 'Latin America' | 'Africa' | 'Southeast Asia' | 'East Asia' | 'Oceania';
  subcategory: 'Optical' | 'Sunglasses' | 'Both' | 'Sport Goggles' | 'Safety' | 'Fashion';
  description: string;
  followerEstimate: number;
  avgLikes: number;
  postsPerWeek: number;
  priceRange: '$' | '$$' | '$$$' | '$$$$';
  founded: number;
  headquarters: string;
};

const CATS: Brand['category'][] = ['Luxury','D2C','Sports','Fast Fashion','Independent','Heritage','Streetwear','Sustainable','Tech','Kids','Celebrity'];
const REGIONS: Brand['region'][] = ['North America','Europe','Asia Pacific','South Asia','Middle East','Latin America','Africa','Southeast Asia','East Asia','Oceania'];
const SUBS: Brand['subcategory'][] = ['Both','Sunglasses','Optical','Sport Goggles','Safety','Fashion'];
const PRICES: Brand['priceRange'][] = ['$','$$','$$$','$$$$'];

// ── 600 global eyewear players ──────────────────────────────────────
const N = [
  // ── Luxury (0-49) ──
  'Ray-Ban','Gucci','Dior','Prada','Chanel','Tom Ford','Versace','Burberry','Fendi','Saint Laurent',
  'Bottega Veneta','Bvlgari','Cartier','Chopard','Ermenegildo Zegna','Giorgio Armani','Celine','Balenciaga',
  'Miu Miu','Chloe','Givenchy','Loewe','Alexander McQueen','Stella McCartney','Marc Jacobs','Jimmy Choo',
  'Max Mara','Brioni','Trussardi','Lozza','Lunor','Mont Blanc','Dolce & Gabbana','Roberto Cavalli',
  'Salvatore Ferragamo','Tiffany & Co.','Berluti','Brunello Cucinelli','Loro Piana','Emilio Pucci',
  'Etro','Missoni','Moschino','Philipp Plein','Balmain','Off-White','Amiri','Fear of God','Jacquemus','Valentino',

  // ── D2C / Direct to Consumer (50-109) ──
  'Warby Parker','Zenni','EyeBuyDirect','Firmoo','Lenskart','John Jacobs','Vincent Chase','Ace & Tate',
  'Sunnies Studios','Diff Eyewear','Quay Australia','Le Specs','BonLook','Peepers','Clearly','GlassesUSA',
  'Felix Gray','Ambr Eyewear','Izipizi','Cubitts','Bridges Eyewear','Eyewa','LivHo','Cyxus','TIJN',
  'SojoS','FEISEDY','Dollger','Retro City','SmartBuyGlasses','SelectSpecs','FramesDirect','39DollarGlasses',
  'Coastal','Liingo Eyewear','Pair Eyewear','Fitz Frames','Arlo Wolf','Ottico','Bloobloom','Ollie Quinn',
  'Oscar Wylee','Bailey Nelson','Dresden Vision','Eyes of Solotica','Lensabl','Roka','Covry','Ojo Optique',
  'Fuse Lenses','EyeGlasses.com','Discount Glasses','Yesglasses','Eyemart Express','OpticalH','Jins','Glassic',
  'Mouqy','EZContacts','Overnight Glasses','Sportrx',

  // ── Sports (110-159) ──
  'Oakley','Nike Vision','Adidas Eyewear','Puma','Under Armour','Smith Optics','Costa','Maui Jim',
  'Revo','Spy Optic','Dragon Alliance','100%','Rudy Project','POC Sports','Julbo','Bolle',
  'Giro','Tifosi','Native Eyewear','Kaenon','Bajio','Rheos','Nectar','Peppers',
  'Sunski','Knockaround','Pit Viper','Goodr','Blenders','Shady Rays','Electric','Von Zipper',
  'New Balance Vision','Speedo','Anon','UVEX','Cebe','TYR','Frogglez','Aqua Sphere',
  'Zoggs','Speedo USA','Arena','Sailfish','Finis','Barracuda','Arena Cobra','MP Michael Phelps',
  'Huub','Zone3',

  // ── Fast Fashion (160-209) ──
  'Hawkers','ASOS Eyewear','H&M','Zara','Uniqlo','Urban Outfitters','Fossil','Calvin Klein',
  'Ralph Lauren','Tommy Hilfiger','Hugo Boss','Coach','Michael Kors','Anne Klein','Lacoste','Guess',
  'Vogue Eyewear','DKNY','Tory Burch','Kate Spade','Police','Polaroid','Carrera','Swatch',
  'G-Star Raw','Timberland','Champion','Fila','Reebok','Prive Revaux','Anthropologie','Free People',
  'Mango','Pull & Bear','Bershka','Stradivarius','Massimo Dutti','Reserved','C&A','Primark',
  'Monsoon','Ted Baker','Superdry','Joules','Radley','Accessorize','River Island','Topshop',
  'Boohoo','PrettyLittleThing',

  // ── Independent / Artisan (210-269) ──
  'Oliver Peoples','MOSCOT','Gentle Monster','Persol','Mykita','IC! Berlin','Jacques Marie Mage',
  'Chrome Hearts','Cutler and Gross','Barton Perreira','Garrett Leight','Mr. Leight','Salt Optics',
  'Krewe','Karen Walker','Valley Eyewear','Sunday Somewhere','Thierry Lasry','Anne et Valentin',
  'Face a Face','DITA','Linda Farrow','The Row','Kuboraum','Marni','RETROSUPERFUTURE','Ahlem',
  'Andy Wolf','Etnia Barcelona','Woodys','Kaleos','Xavier Garcia','Lool','Theo','Monocle',
  'Orgreen','Fleye','Momo Design','Neubau','Wolfgang Proksch','Aru Eyewear','Res/Rei','L.A. Eyeworks',
  'Blake Kuwahara','Matsuda','YUICHI TOYAMA','Yellows Plus','Eyevan 7285','Native Sons','BJ Classic',
  'Masunaga','Tavat','Leisure Society','Robert Marc','Morgenthal Frederics','Sama Eyewear','Gold & Wood',
  'Bevel','Rapp','OVVO Optics','Frost','Caroline Abram','Lucas de Stael',

  // ── Heritage (270-319) ──
  'Lindberg','Silhouette','Rodenstock','Blackfin','Safilo','Luxottica','Essilor','Bausch+Lomb',
  'American Optical','Randolph Eng.','Shuron','Algha','Anglo American','Savile Row','Nikon Eyewear',
  'Hoya','Seiko Optical','Shamir','Zeiss','Indo Optical','Rodenstock GmbH','Fielmann','Apollo',
  'GrandOptical','Atol','Alain Afflelou','Optic 2000','Specsavers','Boots Opticians','Vision Express',
  'Optical Center','Vision Plus','Multiópticas','COTTET','LensCrafters','Visionworks','Target Optical',
  'Costco Optical','Pearl Vision','MyEyeDr','Warby Parker Retail','For Eyes','Stanton Optical',
  'America\'s Best','Eyeglass World','National Vision','Cohen\'s Fashion Optical','Sterling Optical',
  'Site for Sore Eyes','Texas State Optical',

  // ── Streetwear (320-369) ──
  'Raen','Tens','Akila','RetroSuperFuture','A Bathing Ape','Stussy','Palace','Kith',
  'Supreme','Off-White Eyewear','Fear of God Eyewear','Rhude','Heron Preston','Ambush','Sacai','Needles',
  'Kapital','Visvim','Wtaps','Neighborhood','Number (N)ine','Undercover','Cav Empt','Brain Dead',
  'Online Ceramics','Pleasures','Dime','Polar Skate','Hockey','FA Skates','There','Bronze 56K',
  'Fucking Awesome','Pass~Port','Magenta','Yardsale','Butter Goods','Pop Trading Co','Gramicci','Carhartt WIP',
  'Stussy Eyewear','Vans Vault','Nike SB','Converse','New Era','Mitchell & Ness','47 Brand','Starter',
  'Brixton','HUF',

  // ── Sustainable (370-419) ──
  'Sea2See','Dick Moby','Karün','Pala Eyewear','Proof','Bird Eyewear','Zeal Optics','Eco Eyewear',
  'Pela Vision','Proof Eco','WMP Eyewear','Waterhaul','Norton Point','Coral Eyewear','Solo Eyewear',
  'Genusee','Article One','Covry Sunwear','Tens Sustainable','Lowdown','Bambooka','Waiting For The Sun',
  'Parafina','Ochis Coffee','Hemp Eyewear','Grown','Wave Hawaii','Karün South','Swell Vision','EcoOptics',
  'Fauna','GreenVision','Ozeano','TripleLift','ReSea Project','Ocean Cleanup Specs','Bureo Glasses',
  'Bottle Optics','Costa Kick Plastic','Wave Born','Sunga Life','Yuba Eyewear','Rockaway','ByGreen','4Ocean',
  'Package Free','EcoRoot','Allbirds Vision','Reformation Eyes','Outerknown','Patagonia Eyewear',

  // ── Tech / Smart Glasses (420-479) ──
  'Ray-Ban Meta','Bose Frames','Snap Spectacles','Echo Frames','Razer Anzu','Vuzix','Nreal','Xreal',
  'TCL RayNeo','Huawei Eyewear','Bose Tempo','JLab Open','Lucyd','Vue Smart','Rokid','Inmo Air',
  'Magic Leap','HoloLens','Vuzix Blade','DigiLens','WaveOptics','Lumus','Qualcomm XR','LetinAR',
  'Avegant','Everysight','Solos Tech','Form Swim','Recon Jet','Raptor AR','AfterShokz','Ampere Dusk',
  'Mutrics','EyeQue','Mojo Lens','Innovega','eSight','Envision','Tobii Pro','Pupil Labs',
  'Fauna Audio','Oppo Air','LeapMotion','ThinkReality','North Focals','Brilliant Labs','Even Realities',
  'Meizu AR','Samsung Glasses','Apple Vision','Google Glass','Meta Orion','Xiaomi Smart','Lenovo Glasses',
  'Sony SmartEyeglass','Epson Moverio','Toshiba dynaEdge','Iristick','RealWear','Vuzix M400','TeamViewer Frontline',

  // ── Kids (480-529) ──
  'Miraflex','Dilli Dalli','Zoobug','Tomato Glasses','Solo Bambini','NanoVista','Swing Kids','Skechers Kids',
  'Ray-Ban Junior','Nike Kids','Puma Kids','Lacoste Kids','Polaroid Kids','Carrera Kids','Guess Kids','Tommy Kids',
  'Julbo Kids','Cebe Junior','Bollé Junior','Speedo Junior','Babiators','Roshambo Baby','Hipsterkid','Baby Banz',
  'Real Kids','goglz','Koolsun','Suneez','JuniorBanz','iTooTi','SafeStyle','OnGuard',
  'Wiley X Youth','3M Virtua','Uvex Kids','Pyramex Mini','ActiveSol','Banz Adventure','Champion Eyes','Global Vision Kids',
  'Flex Kidz','MyFirst Shades','Frankie Ray','Teeny Tiny Optics','Carter\'s Glasses','OshKosh Eyes','Carters Sun',
  'Tiny Tots Optical','Lil Gadgets','KidZania Frames','Wee Farers','Ro Sham Bo',

  // ── Celebrity / Collaboration Lines (530-599) ──
  'Rihanna x Dior','Gigi Hadid x Vogue','Kylie x Quay','Hailey Bieber x Vogue','Pharrell x Moncler',
  'A$AP Rocky x Retrofuture','Kanye x Yeezy Gap','Bad Bunny x Oakley','Billie Eilish x Nike','Bella Hadid x Chrome Hearts',
  'David Beckham DB','Victoria Beckham Eyewear','Elton John Eyewear','John Legend x Prive','Cardi B x Sunglasses',
  'Jennifer Lopez x Quay','Chiara Ferragni Eyewear','Beyoncé Ivy Park','LeBron James x Nike','Cristiano Ronaldo CR7',
  'Lewis Hamilton x Police','Lionel Messi Eyewear','Neymar Jr Vision','Virat Kohli x Lenskart','MS Dhoni x Lenskart',
  'Ranveer Singh x Lenskart','BTS x Gentle Monster','BLACKPINK x Gentle Monster','G-Dragon x Gentle Monster','Jennie x Gentle Monster',
  'Zendaya x Loewe','Timothée Chalamet x DITA','Harry Styles x Gucci','Dua Lipa x Versace','Travis Scott x Jacques Marie Mage',
  'Tyler the Creator x Golf Wang','Post Malone x Arnette','Pete Davidson x Prive','Snoop Dogg x Knockaround','Diplo x Dragon',
  'Will.i.am x Ill.i Optics','Pharrell x Tiffany','Jay-Z x Maybach','Drake x 100%','The Weeknd x Jean Paul Gaultier',
  'ASAP Ferg x Gentle Monster','Swae Lee x Diff','Offset x Migos','Quavo x Lux','21 Savage x Versace',
  'Doja Cat x Oakley','Ice Spice x Prive','Saweetie x Quay','Megan Thee Stallion x Dolce','Lil Nas X x Jean Paul Gaultier',
  'Rosalia x Loewe','Anitta x Ray-Ban','Karol G x Versace','J Balvin x Oakley','Shakira x Carolina Herrera',
  'Priyanka Chopra x Vogue','Deepika Padukone x Lenskart','Alia Bhatt x Lenskart','Katrina Kaif x Lenskart','Shah Rukh Khan x Lenskart',
  'Son Heung-min x Gentle Monster','Blackpink Lisa x Celine','IU x Gentle Monster','Song Hye-kyo x Fendi','Park Seo-joon x Mykita',
  'Jungkook x Gentle Monster','Olivia Rodrigo x Oliver Peoples','Emma Chamberlain x Warby Parker',
];

const H = N.map(n =>
  n.toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '')
    .substring(0, 22)
);

// ── Category ranges: [startIndex, categoryIndex] ──
const CAT_RANGES: [number, number][] = [
  [0, 0],    // Luxury
  [50, 1],   // D2C
  [110, 2],  // Sports
  [160, 3],  // Fast Fashion
  [210, 4],  // Independent
  [270, 5],  // Heritage
  [320, 6],  // Streetwear
  [370, 7],  // Sustainable
  [420, 8],  // Tech
  [480, 9],  // Kids
  [530, 10], // Celebrity
];

function assignCategory(i: number): number {
  for (let r = CAT_RANGES.length - 1; r >= 0; r--) {
    if (i >= CAT_RANGES[r][0]) return CAT_RANGES[r][1];
  }
  return 0;
}

// ── Region indices ──
function assignRegion(i: number): number {
  const s = ((i * 2654435761) >>> 0) % 100;
  // Weighted distribution: NA 20%, Europe 25%, Asia Pac 10%, South Asia 10%, ME 8%, LatAm 8%, Africa 5%, SE Asia 5%, East Asia 6%, Oceania 3%
  if (s < 20) return 0; // North America
  if (s < 45) return 1; // Europe
  if (s < 55) return 2; // Asia Pacific
  if (s < 65) return 3; // South Asia
  if (s < 73) return 4; // Middle East
  if (s < 81) return 5; // Latin America
  if (s < 86) return 6; // Africa
  if (s < 91) return 7; // Southeast Asia
  if (s < 97) return 8; // East Asia
  return 9; // Oceania
}

// ── Subcategory indices ──
function assignSub(i: number, cat: number): number {
  const s = ((i * 1664525 + 1013904223) >>> 0) % 100;
  if (cat === 2) { // Sports
    if (s < 30) return 3; // Sport Goggles
    if (s < 60) return 1; // Sunglasses
    return 0; // Both
  }
  if (cat === 9) { // Kids
    if (s < 40) return 0; // Both
    if (s < 60) return 2; // Optical
    if (s < 80) return 4; // Safety
    return 5; // Fashion
  }
  if (cat === 8) { // Tech
    return 0; // Both
  }
  if (s < 35) return 0; // Both
  if (s < 55) return 1; // Sunglasses
  if (s < 75) return 2; // Optical
  if (s < 85) return 5; // Fashion
  return 0; // Both
}

// ── Price indices ──
function assignPrice(cat: number, i: number): number {
  const s = ((i * 48271) >>> 0) % 100;
  if (cat === 0 || cat === 10) { // Luxury & Celebrity
    if (s < 50) return 3; // $$$$
    return 2; // $$$
  }
  if (cat === 1) { // D2C
    if (s < 40) return 0; // $
    if (s < 80) return 1; // $$
    return 2; // $$$
  }
  if (cat === 3) { // Fast Fashion
    if (s < 50) return 0; // $
    if (s < 85) return 1; // $$
    return 2; // $$$
  }
  if (cat === 4) { // Independent
    if (s < 30) return 2; // $$$
    if (s < 70) return 3; // $$$$
    return 2; // $$$
  }
  if (cat === 7) { // Sustainable
    if (s < 40) return 1; // $$
    if (s < 80) return 2; // $$$
    return 1; // $$
  }
  // Default
  if (s < 25) return 0;
  if (s < 60) return 1;
  if (s < 85) return 2;
  return 3;
}

// ── Headquarters ──
const HQ_POOLS: Record<string, string[]> = {
  'North America': ['New York, USA','Los Angeles, USA','San Francisco, USA','Toronto, Canada','Austin, USA','Portland, USA','Chicago, USA','Miami, USA','Denver, USA','Boston, USA'],
  'Europe': ['Paris, France','Milan, Italy','London, UK','Berlin, Germany','Amsterdam, Netherlands','Copenhagen, Denmark','Barcelona, Spain','Vienna, Austria','Zurich, Switzerland','Stockholm, Sweden'],
  'Asia Pacific': ['Tokyo, Japan','Sydney, Australia','Melbourne, Australia','Auckland, NZ','Osaka, Japan','Brisbane, Australia','Perth, Australia','Wellington, NZ','Singapore','Hong Kong'],
  'South Asia': ['Bangalore, India','Mumbai, India','Delhi, India','Colombo, Sri Lanka','Dhaka, Bangladesh','Pune, India','Hyderabad, India','Chennai, India','Karachi, Pakistan','Lahore, Pakistan'],
  'Middle East': ['Dubai, UAE','Abu Dhabi, UAE','Riyadh, Saudi Arabia','Doha, Qatar','Tel Aviv, Israel','Istanbul, Turkey','Amman, Jordan','Beirut, Lebanon','Muscat, Oman','Kuwait City, Kuwait'],
  'Latin America': ['São Paulo, Brazil','Mexico City, Mexico','Buenos Aires, Argentina','Bogota, Colombia','Santiago, Chile','Lima, Peru','Medellin, Colombia','Guadalajara, Mexico','Monterrey, Mexico','Cancun, Mexico'],
  'Africa': ['Cape Town, SA','Nairobi, Kenya','Lagos, Nigeria','Accra, Ghana','Johannesburg, SA','Casablanca, Morocco','Cairo, Egypt','Addis Ababa, Ethiopia','Kigali, Rwanda','Dar es Salaam, Tanzania'],
  'Southeast Asia': ['Manila, Philippines','Bangkok, Thailand','Jakarta, Indonesia','Ho Chi Minh, Vietnam','Kuala Lumpur, Malaysia','Hanoi, Vietnam','Bali, Indonesia','Cebu, Philippines','Yangon, Myanmar','Phnom Penh, Cambodia'],
  'East Asia': ['Seoul, South Korea','Beijing, China','Shanghai, China','Shenzhen, China','Taipei, Taiwan','Hong Kong, China','Guangzhou, China','Chengdu, China','Hangzhou, China','Busan, South Korea'],
  'Oceania': ['Sydney, Australia','Melbourne, Australia','Auckland, NZ','Brisbane, Australia','Perth, Australia','Gold Coast, Australia','Adelaide, Australia','Christchurch, NZ','Hobart, Australia','Wellington, NZ'],
};

const REGION_NAMES = ['North America','Europe','Asia Pacific','South Asia','Middle East','Latin America','Africa','Southeast Asia','East Asia','Oceania'];

function assignHQ(regionIdx: number, i: number): string {
  const pool = HQ_POOLS[REGION_NAMES[regionIdx]];
  return pool[((i * 2654435761) >>> 0) % pool.length];
}

function seed(i: number): number { return ((i * 2654435761) >>> 0) % 1000; }

function genFollowers(i: number, cat: number): number {
  const base = [3000000, 800000, 2000000, 2500000, 500000, 1200000, 600000, 300000, 1500000, 400000, 5000000][cat];
  const variation = (seed(i) - 500) * (base / 500);
  return Math.max(10000, Math.round(base + variation));
}

function genFounded(i: number, cat: number): number {
  const bases: Record<number, [number, number]> = {
    0: [1920, 100], // Luxury: 1920-2020
    1: [2005, 20],  // D2C: 2005-2025
    2: [1975, 50],  // Sports: 1975-2025
    3: [1990, 35],  // Fast Fashion: 1990-2025
    4: [1960, 60],  // Independent: 1960-2020
    5: [1850, 170], // Heritage: 1850-2020
    6: [2000, 25],  // Streetwear: 2000-2025
    7: [2010, 16],  // Sustainable: 2010-2026
    8: [2012, 14],  // Tech: 2012-2026
    9: [2005, 20],  // Kids: 2005-2025
    10: [2015, 11], // Celebrity: 2015-2026
  };
  const [base, range] = bases[cat] || [2000, 25];
  return base + (seed(i + 300) % range);
}

export const BRANDS: Brand[] = N.map((name, i) => {
  const ci = assignCategory(i);
  const ri = assignRegion(i);
  const si = assignSub(i, ci);
  const pi = assignPrice(ci, i);
  const followers = genFollowers(i, ci);
  const avgLikes = Math.round(followers * (0.01 + seed(i + 100) * 0.00005));
  return {
    id: i + 1,
    name,
    handle: H[i],
    category: CATS[ci],
    region: REGIONS[ri],
    subcategory: SUBS[si],
    priceRange: PRICES[pi],
    followerEstimate: followers,
    avgLikes,
    postsPerWeek: 2 + (seed(i + 200) % 8),
    founded: genFounded(i, ci),
    headquarters: assignHQ(ri, i),
    description: `${name} — ${(CATS[ci] || 'D2C').toLowerCase()} eyewear brand from ${REGIONS[ri] || 'Global'}. ${SUBS[si] || 'Both'} collection.`,
  };
});
