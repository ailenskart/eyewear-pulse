export type Brand = {
  id: number;
  name: string;
  handle: string;
  category: 'Luxury' | 'D2C' | 'Sports' | 'Fast Fashion' | 'Independent' | 'Heritage' | 'Streetwear' | 'Sustainable' | 'Tech' | 'Kids';
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

const CATS: Brand['category'][] = ['Luxury','D2C','Sports','Fast Fashion','Independent','Heritage','Streetwear','Sustainable','Tech','Kids'];
const REGIONS: Brand['region'][] = ['North America','Europe','Asia Pacific','South Asia','Middle East','Latin America','Africa','Southeast Asia','East Asia','Oceania'];
const SUBS: Brand['subcategory'][] = ['Both','Sunglasses','Optical','Sport Goggles','Safety','Fashion'];
const PRICES: Brand['priceRange'][] = ['$','$$','$$$','$$$$'];

const N = [
  'Ray-Ban','Oakley','Warby Parker','Gucci','Dior','Gentle Monster','MOSCOT','Oliver Peoples','Persol','Prada',
  'Lenskart','Maui Jim','Costa','Titan Eyeplus','Zenni','EyeBuyDirect','Firmoo','Ace & Tate','Sunnies Studios','Mykita',
  'IC! Berlin','Jacques Marie Mage','Chrome Hearts','Cutler and Gross','Barton Perreira','Garrett Leight','Mr. Leight','Salt Optics','Krewe','Diff Eyewear',
  'Quay Australia','Le Specs','Karen Walker','Valley Eyewear','Sunday Somewhere','Celine','Balenciaga','Versace','Burberry','Tom Ford',
  'Fendi','Saint Laurent','Bottega Veneta','Bvlgari','Cartier','Chopard','Chanel','Ermenegildo Zegna','Giorgio Armani','John Jacobs',
  'Vincent Chase','Bridges Eyewear','Saturday Club','Eyewa','Atassi','Barakat Optical','Elihle','Wazi Eyewear','Luq Eyewear','Florentino',
  'SOL Eyewear','Hawkers','ASOS Eyewear','H&M','Urban Outfitters','Zara','Uniqlo','Fossil','Calvin Klein','Ralph Lauren',
  'Tommy Hilfiger','Hugo Boss','Coach','Michael Kors','Anne Klein','Nike Vision','Adidas Eyewear','Puma','New Balance Vision','Speedo',
  'Revo','Smith Optics','Spy Optic','Dragon Alliance','Anon','UVEX','Bolle','Julbo','POC Sports','100%',
  'Rudy Project','Giro','Hawke Optics','ZEISS','3M Safety','Honeywell Safety','Pyramex','Wiley X','ESS','Bolle Safety',
  'Clearly','GlassesUSA','Lenscrafters','Visionworks','Costco Optical','Target Optical','Eyeglasses.com','BonLook','WP Home Try-On','Peepers',
  'Proof','Randolph Eng.','RB Wayfarer','Randolph Aviator','American Optical','Bausch+Lomb','Safilo','Luxottica','Essilor','Shaboozey',
  'Badass Sunnies','Clearly Basics','Eco Eyewear','Conscious','Pela Vision','Sea2See','Dick Moby','Karün','Pala Eyewear','Proof Eco',
  'Bird Eyewear','Zeal Optics','WMP Eyewear','Tens','Sunski','Shady Rays','Knockaround','Pit Viper','Goodr','Blenders',
  'Native Eyewear','Tifosi','Juliana','Electric','Von Zipper','Kaenon','Bajio','Rheos','Flow Vision','Nectar',
  'Peppers','Optic Nerve','OTIS','Salty Crew','Raen','Thierry Lasry','Anne et Valentin','Face a Face','DITA','Linda Farrow',
  'The Row','Kuboraum','Marni','RETROSUPERFUTURE','Ahlem','Andy Wolf','Lindberg','Silhouette','Rodenstock','Blackfin',
  'Etnia Barcelona','Woodys','Kaleos','Xavier Garcia','Lool','Theo','Monocle','Masunaga','Matsuda','YUICHI TOYAMA',
  'Yellows Plus','Eyevan 7285','Native Sons','BJ Classic','Megane Ichiba','JINS','Zoff','Paris Miki','Oh My Glasses','Owndays',
  'Capitol Eye','VisionSpring','LensPro','Eyemasters','SmartBuyGlasses','SelectSpecs','FramesDirect','39DollarGlasses','Coastal','Felix Gray',
  'Ambr Eyewear','Izipizi','Orgreen','Fleye','Momo Design','BMW Vision','Porsche Design','Cazal','Carrera','Police',
  'Lacoste','Guess','Vogue Eyewear','DKNY','Tory Burch','Kate Spade','Prive Revaux','Warby','AllBirds Eye','Everlane',
  'Cubitts','Aru Eyewear','Neubau','Wolfgang Proksch','Lunor','Lozza','Trussardi','Brioni','Max Mara','Miu Miu',
  'Chloe','Givenchy','Loewe','Alexander McQueen','Stella McCartney','Kenzo','Marc Jacobs','Jimmy Choo','Furla','Fossil Q',
  'Hublot','Tag Heuer','Swatch','G-Star Raw','Timberland','Champion','Fila','Reebok','Under Armour','Asics',
  'Mizuno','Yonex','Lululemon','Puma Linea Rossa','Oakley Custom','Polaroid','Solaris','Sunglass Hut','LensCrafters Plus','Vision Express',
  'Optical Center','Apollo','Fielmann','GrandOptical','Atol','Multiópticas','COTTET','Vision Plus','Alain Afflelou','Optic 2000',
  'Specsavers','Boots Opticians','Dollond','Vision Direct','Mr Spex','EyeWish','Hans Anders','Eyes + More','Ace & Tate Studio','Pro Direct',
  'Clear Vision','OptiMax','Pearl Vision','MyEyeDr','LivHo','Cyxus','TIJN','SojoS','FEISEDY','Dollger',
  'Retro City','Peter Jones','Mont Blanc','Bose Frames','Snap Spectacles','Ray-Ban Stories','Echo Frames','Razer Anzu','Fauna Audio','Vuzix',
  'Nreal','TCL RayNeo','Xreal','RayBan Meta','Huawei Gentlem.','Bose Tempo','JLab Open','Lucyd','Vue Smart','North Focals',
  'Oppo Air','Rokid','Inmo Air','LeapMotion','Magic Leap','HoloLens','ThinkReality','Vuzix Blade','DigiLens','WaveOptics',
  'Lumus','TDK Invisia','Qualcomm XR','LetinAR','Avegant','Everysight','Solos Tech','Form Swim','Recon Jet','Raptor AR',
  'AfterShokz','Ampere Dusk','Mutrics','Horizon','Amica','VueLight','EyeQue','Mojo Lens','Innovega','eSight',
  'Lumen Optics','OptiShokz','Aria AR','Envision','Tobii Pro','Pupil Labs','SensoMotoric','EyeTech','EyeTracking','Visage',
  'Titanium Line','Carbon Specs','Flexi-Fit','NanoVista','Swing Kids','Zoobug','Tomato Glasses','Solo Bambini','Miraflex','Dilli Dalli',
  'Skechers Kids','Ray-Ban Junior','Nike Kids','Puma Kids','Lacoste Kids','Polaroid Kids','Carrera Kids','Vogue Kids','Guess Kids','Tommy Kids',
  'Boss Kids','Fila Kids','Champion Kids','Julbo Kids','Cebe Junior','Bollé Junior','Speedo Junior','TYR Junior','Frogglez','Baby Banz',
  'Real Kids','Roshambo Baby','Babiators','Hipsterkid','Bueller','goglz','Koolsun','Suneez','JuniorBanz','iTooTi',
  'SafeStyle','OnGuard','Wiley X Youth','3M Virtua','Uvex Kids','Pyramex Mini','Global Vision','Champion Eyes','Banz Adventure','ActiveSol',
];

const H = N.map(n => n.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20));

const CI = [5,2,1,0,0,0,5,0,5,0,1,2,2,1,1,1,1,1,1,3,3,0,0,5,0,3,3,3,1,1,3,3,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,3,1,1,0,3,8,3,1,0,1,3,3,3,3,3,3,3,0,0,3,0,0,0,3,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,9,9,9,9,9,9,8];
const RI = [3,6,6,3,3,2,6,6,3,3,8,1,6,8,6,6,2,3,9,3,3,6,6,3,6,6,6,6,6,6,7,7,7,6,1,3,3,3,3,6,3,3,3,3,3,3,3,3,3,8,8,9,9,5,5,5,0,0,0,4,4,3,3,3,6,3,2,6,6,6,6,3,6,6,6,6,3,3,6,7,6,6,6,6,6,3,3,3,3,6,3,6,3,3,6,6,6,6,6,6];
const SI = [0,4,0,0,0,1,2,0,5,0,0,5,5,0,0,0,0,0,5,0,0,5,0,0,0,0,0,0,5,5,5,5,0,5,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,5,5,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,4,4,5,4,4,4,4,4,4,4,4,4,4,4,3,2,4,4,4,4,4,4];
const PI = [2,2,1,3,3,2,2,2,2,3,0,2,2,1,0,0,0,1,1,2,2,3,3,2,2,2,2,1,2,1,1,1,2,1,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,1,1,1,1,2,1,1,1,1,2,1,1,0,0,1,1,0,1,2,2,1,2,1,1,1,2,1,1,1,1,1,2,1,1,1,1,1,1,2,1,2,1,2,2,1,1,1,1,1,0];

const HQS = [
  'Venice, Italy','Foothill Ranch, USA','New York, USA','Florence, Italy','Paris, France','Seoul, South Korea','New York, USA','Los Angeles, USA','Agordo, Italy','Milan, Italy',
  'Bangalore, India','Lahaina, USA','Daytona Beach, USA','Bangalore, India','San Francisco, USA','Irvine, USA','Chengdu, China','Amsterdam, Netherlands','Manila, Philippines','Berlin, Germany',
  'Berlin, Germany','Los Angeles, USA','Los Angeles, USA','London, UK','Los Angeles, USA','Los Angeles, USA','Los Angeles, USA','Toronto, Canada','New Orleans, USA','Los Angeles, USA',
  'Gold Coast, Australia','Melbourne, Australia','Auckland, NZ','Toronto, Canada','Sydney, Australia','Paris, France','Paris, France','Milan, Italy','London, UK','New York, USA',
  'Rome, Italy','Paris, France','Venice, Italy','Rome, Italy','Paris, France','Geneva, Switzerland','Paris, France','Trivero, Italy','Milan, Italy','Bangalore, India',
  'Bangalore, India','Bangkok, Thailand','Ho Chi Minh, Vietnam','Dubai, UAE','Dubai, UAE','Abu Dhabi, UAE','Cape Town, SA','Nairobi, Kenya','Johannesburg, SA','São Paulo, Brazil',
  'Mexico City, Mexico','Valencia, Spain','London, UK','Stockholm, Sweden','Philadelphia, USA','Arteixo, Spain','Tokyo, Japan','Dallas, USA','New York, USA','New York, USA',
  'New York, USA','Metzingen, Germany','New York, USA','New York, USA','New York, USA','Beaverton, USA','Herzogenaurach, Germany','Herzogenaurach, Germany','Boston, USA','Sydney, Australia',
  'Boulder, USA','Livermore, USA','Irvine, USA','Long Beach, USA','Irvine, USA','Nuremberg, Germany','Oyonnax, France','Oyonnax, France','Stockholm, Sweden','Long Beach, USA',
  'Bassano, Italy','Santa Cruz, USA','Leicester, UK','Oberkochen, Germany','Minneapolis, USA','Charlotte, USA','Houston, USA','Colorado, USA','Valencia, USA','Lyon, France',
];

function seed(i: number): number { return ((i * 2654435761) >>> 0) % 1000; }

function genFollowers(i: number, cat: number): number {
  const base = [3000000,1500000,2000000,4000000,500000,2000000,800000,400000,1500000,600000][cat];
  return Math.max(50000, base + (seed(i) - 500) * 5000);
}

export const BRANDS: Brand[] = N.map((name, i) => {
  const ci = CI[i % CI.length];
  const ri = RI[i % RI.length];
  const si = SI[i % SI.length];
  const pi = PI[i % PI.length];
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
    founded: 1850 + (seed(i + 300) % 175),
    headquarters: HQS[i % HQS.length],
    description: `${name} - ${CATS[ci].toLowerCase()} eyewear from ${REGIONS[ri]}`,
  };
});
