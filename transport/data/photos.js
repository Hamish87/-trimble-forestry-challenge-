/* Holztransport demo · site photos for the demo stacks: freely licensed photographs of roadside log piles from
   Wikimedia Commons, hotlinked at 1280 px (strip: 500 px — Commons serves fixed widths only) with the author, licence and file page kept for attribution
   (PLAN.md D11). Nothing is copied into the repository; the demo needs the network for them as it does for map tiles.
   Groups: sawlogs (long logs beside a forest road), stacked (short industrial wood), ends (log faces, offcuts). */
'use strict';
(function(){
const PHOTOS=[
 {
  "id": "roadside-spruce-harz-1",
  "group": "sawlogs",
  "title": "Stacked spruce logs beside a forest road near Wernigerode, Harz, Germany – side view of the pile.jpg",
  "author": "Profpcde",
  "license": "CC0",
  "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
  "page": "https://commons.wikimedia.org/wiki/File:Stacked_spruce_logs_beside_a_forest_road_near_Wernigerode,_Harz,_Germany_%E2%80%93_side_view_of_the_pile.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Stacked_spruce_logs_beside_a_forest_road_near_Wernigerode%2C_Harz%2C_Germany_%E2%80%93_side_view_of_the_pile.jpg/1280px-Stacked_spruce_logs_beside_a_forest_road_near_Wernigerode%2C_Harz%2C_Germany_%E2%80%93_side_view_of_the_pile.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Stacked_spruce_logs_beside_a_forest_road_near_Wernigerode%2C_Harz%2C_Germany_%E2%80%93_side_view_of_the_pile.jpg/500px-Stacked_spruce_logs_beside_a_forest_road_near_Wernigerode%2C_Harz%2C_Germany_%E2%80%93_side_view_of_the_pile.jpg"
 },
 {
  "id": "roadside-spruce-harz-2",
  "group": "sawlogs",
  "title": "Stacked spruce logs beside a forest road near Wernigerode, Harz, Germany – view along the track.jpg",
  "author": "Profpcde",
  "license": "CC0",
  "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
  "page": "https://commons.wikimedia.org/wiki/File:Stacked_spruce_logs_beside_a_forest_road_near_Wernigerode,_Harz,_Germany_%E2%80%93_view_along_the_track.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Stacked_spruce_logs_beside_a_forest_road_near_Wernigerode%2C_Harz%2C_Germany_%E2%80%93_view_along_the_track.jpg/1280px-Stacked_spruce_logs_beside_a_forest_road_near_Wernigerode%2C_Harz%2C_Germany_%E2%80%93_view_along_the_track.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Stacked_spruce_logs_beside_a_forest_road_near_Wernigerode%2C_Harz%2C_Germany_%E2%80%93_view_along_the_track.jpg/500px-Stacked_spruce_logs_beside_a_forest_road_near_Wernigerode%2C_Harz%2C_Germany_%E2%80%93_view_along_the_track.jpg"
 },
 {
  "id": "roadside-mossberge",
  "group": "sawlogs",
  "title": "Near Mossberge 2020-05-15 28.jpg",
  "author": "Leonhard Lenz",
  "license": "CC0",
  "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
  "page": "https://commons.wikimedia.org/wiki/File:Near_Mossberge_2020-05-15_28.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Near_Mossberge_2020-05-15_28.jpg/1280px-Near_Mossberge_2020-05-15_28.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Near_Mossberge_2020-05-15_28.jpg/500px-Near_Mossberge_2020-05-15_28.jpg"
 },
 {
  "id": "roadside-taunus",
  "group": "sawlogs",
  "title": "Taunus in Oberursel 2021-08-12 01.jpg",
  "author": "Leonhard Lenz",
  "license": "CC0",
  "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
  "page": "https://commons.wikimedia.org/wiki/File:Taunus_in_Oberursel_2021-08-12_01.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Taunus_in_Oberursel_2021-08-12_01.jpg/1280px-Taunus_in_Oberursel_2021-08-12_01.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Taunus_in_Oberursel_2021-08-12_01.jpg/500px-Taunus_in_Oberursel_2021-08-12_01.jpg"
 },
 {
  "id": "roadside-havixbeck",
  "group": "sawlogs",
  "title": "Havixbeck, Hohenholte, Wald -- 2021 -- 0802.jpg",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:Havixbeck,_Hohenholte,_Wald_--_2021_--_0802.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Havixbeck%2C_Hohenholte%2C_Wald_--_2021_--_0802.jpg/1280px-Havixbeck%2C_Hohenholte%2C_Wald_--_2021_--_0802.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Havixbeck%2C_Hohenholte%2C_Wald_--_2021_--_0802.jpg/500px-Havixbeck%2C_Hohenholte%2C_Wald_--_2021_--_0802.jpg"
 },
 {
  "id": "roadside-haltern",
  "group": "sawlogs",
  "title": "Haltern am See, Naturpark Hohe Mark -- 2022 -- 0912.jpg",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:Haltern_am_See,_Naturpark_Hohe_Mark_--_2022_--_0912.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Haltern_am_See%2C_Naturpark_Hohe_Mark_--_2022_--_0912.jpg/1280px-Haltern_am_See%2C_Naturpark_Hohe_Mark_--_2022_--_0912.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Haltern_am_See%2C_Naturpark_Hohe_Mark_--_2022_--_0912.jpg/500px-Haltern_am_See%2C_Naturpark_Hohe_Mark_--_2022_--_0912.jpg"
 },
 {
  "id": "roadside-blackcraig",
  "group": "sawlogs",
  "title": "Blackcraig Forest Log Pile - geograph.org.uk - 8362806.jpg",
  "author": "Karl Peet",
  "license": "CC BY-SA 2.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
  "page": "https://commons.wikimedia.org/wiki/File:Blackcraig_Forest_Log_Pile_-_geograph.org.uk_-_8362806.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Blackcraig_Forest_Log_Pile_-_geograph.org.uk_-_8362806.jpg/1280px-Blackcraig_Forest_Log_Pile_-_geograph.org.uk_-_8362806.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Blackcraig_Forest_Log_Pile_-_geograph.org.uk_-_8362806.jpg/500px-Blackcraig_Forest_Log_Pile_-_geograph.org.uk_-_8362806.jpg"
 },
 {
  "id": "roadside-mullagh",
  "group": "sawlogs",
  "title": "Log pile alongside a forest road on the western slopes of Mullaghattin - geograph.org.uk - 5403078.jpg",
  "author": "Eric Jones",
  "license": "CC BY-SA 2.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
  "page": "https://commons.wikimedia.org/wiki/File:Log_pile_alongside_a_forest_road_on_the_western_slopes_of_Mullaghattin_-_geograph.org.uk_-_5403078.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Log_pile_alongside_a_forest_road_on_the_western_slopes_of_Mullaghattin_-_geograph.org.uk_-_5403078.jpg/1280px-Log_pile_alongside_a_forest_road_on_the_western_slopes_of_Mullaghattin_-_geograph.org.uk_-_5403078.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Log_pile_alongside_a_forest_road_on_the_western_slopes_of_Mullaghattin_-_geograph.org.uk_-_5403078.jpg/500px-Log_pile_alongside_a_forest_road_on_the_western_slopes_of_Mullaghattin_-_geograph.org.uk_-_5403078.jpg"
 },
 {
  "id": "roadside-charlton",
  "group": "sawlogs",
  "title": "Log pile on forest road in Charlton forest - geograph.org.uk - 1962466.jpg",
  "author": "Dave Spicer",
  "license": "CC BY-SA 2.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
  "page": "https://commons.wikimedia.org/wiki/File:Log_pile_on_forest_road_in_Charlton_forest_-_geograph.org.uk_-_1962466.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Log_pile_on_forest_road_in_Charlton_forest_-_geograph.org.uk_-_1962466.jpg/1280px-Log_pile_on_forest_road_in_Charlton_forest_-_geograph.org.uk_-_1962466.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Log_pile_on_forest_road_in_Charlton_forest_-_geograph.org.uk_-_1962466.jpg/500px-Log_pile_on_forest_road_in_Charlton_forest_-_geograph.org.uk_-_1962466.jpg"
 },
 {
  "id": "field-edge-duelmen",
  "group": "sawlogs",
  "title": "Dülmen, Kirchspiel, Feld in der Bauerschaft Börnste -- 2016 -- 1783.jpg",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Kirchspiel,_Feld_in_der_Bauerschaft_B%C3%B6rnste_--_2016_--_1783.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/D%C3%BClmen%2C_Kirchspiel%2C_Feld_in_der_Bauerschaft_B%C3%B6rnste_--_2016_--_1783.jpg/1280px-D%C3%BClmen%2C_Kirchspiel%2C_Feld_in_der_Bauerschaft_B%C3%B6rnste_--_2016_--_1783.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/D%C3%BClmen%2C_Kirchspiel%2C_Feld_in_der_Bauerschaft_B%C3%B6rnste_--_2016_--_1783.jpg/500px-D%C3%BClmen%2C_Kirchspiel%2C_Feld_in_der_Bauerschaft_B%C3%B6rnste_--_2016_--_1783.jpg"
 },
 {
  "id": "forest-road-poertschach",
  "group": "sawlogs",
  "title": "Pörtschach Winklern Bannwaldweg 8 Forststraße 25122017 2194.jpg",
  "author": "Johann Jaritz",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:P%C3%B6rtschach_Winklern_Bannwaldweg_8_Forststra%C3%9Fe_25122017_2194.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/P%C3%B6rtschach_Winklern_Bannwaldweg_8_Forststra%C3%9Fe_25122017_2194.jpg/1280px-P%C3%B6rtschach_Winklern_Bannwaldweg_8_Forststra%C3%9Fe_25122017_2194.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/P%C3%B6rtschach_Winklern_Bannwaldweg_8_Forststra%C3%9Fe_25122017_2194.jpg/500px-P%C3%B6rtschach_Winklern_Bannwaldweg_8_Forststra%C3%9Fe_25122017_2194.jpg"
 },
 {
  "id": "pile-rueti",
  "group": "sawlogs",
  "title": "Pile of wood Rüti bei Büren.jpg",
  "author": "Gestumblindi",
  "license": "CC BY 3.0",
  "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
  "page": "https://commons.wikimedia.org/wiki/File:Pile_of_wood_R%C3%BCti_bei_B%C3%BCren.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Pile_of_wood_R%C3%BCti_bei_B%C3%BCren.jpg/1280px-Pile_of_wood_R%C3%BCti_bei_B%C3%BCren.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Pile_of_wood_R%C3%BCti_bei_B%C3%BCren.jpg/500px-Pile_of_wood_R%C3%BCti_bei_B%C3%BCren.jpg"
 },
 {
  "id": "meadow-kranzberg",
  "group": "sawlogs",
  "title": "Hoher Kranzberg Nähe Lautersee.jpg",
  "author": "Kritzolina",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:Hoher_Kranzberg_N%C3%A4he_Lautersee.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Hoher_Kranzberg_N%C3%A4he_Lautersee.jpg/1280px-Hoher_Kranzberg_N%C3%A4he_Lautersee.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Hoher_Kranzberg_N%C3%A4he_Lautersee.jpg/500px-Hoher_Kranzberg_N%C3%A4he_Lautersee.jpg"
 },
 {
  "id": "track-logpile",
  "group": "sawlogs",
  "title": "Track and log pile - geograph.org.uk - 3583543.jpg",
  "author": "J.Hannan-Briggs",
  "license": "CC BY-SA 2.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
  "page": "https://commons.wikimedia.org/wiki/File:Track_and_log_pile_-_geograph.org.uk_-_3583543.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Track_and_log_pile_-_geograph.org.uk_-_3583543.jpg/1280px-Track_and_log_pile_-_geograph.org.uk_-_3583543.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Track_and_log_pile_-_geograph.org.uk_-_3583543.jpg/500px-Track_and_log_pile_-_geograph.org.uk_-_3583543.jpg"
 },
 {
  "id": "marked-logs-fichtelgebirge",
  "group": "sawlogs",
  "title": "Forstwirtschaft im Fichtelgebirge.jpg",
  "author": "Geoprofi Lars",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:Forstwirtschaft_im_Fichtelgebirge.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Forstwirtschaft_im_Fichtelgebirge.jpg/1280px-Forstwirtschaft_im_Fichtelgebirge.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Forstwirtschaft_im_Fichtelgebirge.jpg/500px-Forstwirtschaft_im_Fichtelgebirge.jpg"
 },
 {
  "id": "stacked-karsdorf",
  "group": "stacked",
  "title": "20191020140DR Karsdorf (Rabenau) Holzpolter in der Zipfelheide.jpg",
  "author": "Jörg Blobelt",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:20191020140DR_Karsdorf_(Rabenau)_Holzpolter_in_der_Zipfelheide.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/20191020140DR_Karsdorf_%28Rabenau%29_Holzpolter_in_der_Zipfelheide.jpg/1280px-20191020140DR_Karsdorf_%28Rabenau%29_Holzpolter_in_der_Zipfelheide.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/20191020140DR_Karsdorf_%28Rabenau%29_Holzpolter_in_der_Zipfelheide.jpg/500px-20191020140DR_Karsdorf_%28Rabenau%29_Holzpolter_in_der_Zipfelheide.jpg"
 },
 {
  "id": "stacked-deu-1",
  "group": "stacked",
  "title": "01412 DEU stacked woodpile - ready for collection V-P.jpg",
  "author": "Virtual-Pano",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:01412_DEU_stacked_woodpile_-_ready_for_collection_V-P.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/01412_DEU_stacked_woodpile_-_ready_for_collection_V-P.jpg/1280px-01412_DEU_stacked_woodpile_-_ready_for_collection_V-P.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/01412_DEU_stacked_woodpile_-_ready_for_collection_V-P.jpg/500px-01412_DEU_stacked_woodpile_-_ready_for_collection_V-P.jpg"
 },
 {
  "id": "stacked-deu-2",
  "group": "stacked",
  "title": "01415 DEU stacked woodpile - frontal view - ready for collection V-P.jpg",
  "author": "Virtual-Pano",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:01415_DEU_stacked_woodpile_-_frontal_view_-_ready_for_collection_V-P.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/01415_DEU_stacked_woodpile_-_frontal_view_-_ready_for_collection_V-P.jpg/1280px-01415_DEU_stacked_woodpile_-_frontal_view_-_ready_for_collection_V-P.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/01415_DEU_stacked_woodpile_-_frontal_view_-_ready_for_collection_V-P.jpg/500px-01415_DEU_stacked_woodpile_-_frontal_view_-_ready_for_collection_V-P.jpg"
 },
 {
  "id": "log-ends-wildpark",
  "group": "ends",
  "title": "Dülmen, Wildpark -- 2015 -- 8808.jpg",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Wildpark_--_2015_--_8808.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/D%C3%BClmen%2C_Wildpark_--_2015_--_8808.jpg/1280px-D%C3%BClmen%2C_Wildpark_--_2015_--_8808.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/D%C3%BClmen%2C_Wildpark_--_2015_--_8808.jpg/500px-D%C3%BClmen%2C_Wildpark_--_2015_--_8808.jpg"
 },
 {
  "id": "log-ends-wildpark-2",
  "group": "ends",
  "title": "Dülmen, Wildpark -- 2015 -- 8806.jpg",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Wildpark_--_2015_--_8806.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/D%C3%BClmen%2C_Wildpark_--_2015_--_8806.jpg/1280px-D%C3%BClmen%2C_Wildpark_--_2015_--_8806.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/D%C3%BClmen%2C_Wildpark_--_2015_--_8806.jpg/500px-D%C3%BClmen%2C_Wildpark_--_2015_--_8806.jpg"
 },
 {
  "id": "numbered-log-22",
  "group": "ends",
  "title": "Dülmen, Wildpark -- 2017 -- 9266.jpg",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Wildpark_--_2017_--_9266.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/D%C3%BClmen%2C_Wildpark_--_2017_--_9266.jpg/1280px-D%C3%BClmen%2C_Wildpark_--_2017_--_9266.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/D%C3%BClmen%2C_Wildpark_--_2017_--_9266.jpg/500px-D%C3%BClmen%2C_Wildpark_--_2017_--_9266.jpg"
 },
 {
  "id": "log-face-tyrol-2",
  "group": "ends",
  "title": "Timber in Tyrol 02.jpg",
  "author": "Kritzolina",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:Timber_in_Tyrol_02.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Timber_in_Tyrol_02.jpg/1280px-Timber_in_Tyrol_02.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Timber_in_Tyrol_02.jpg/500px-Timber_in_Tyrol_02.jpg"
 },
 {
  "id": "log-face-tyrol-1",
  "group": "ends",
  "title": "Timber in Tyrol 01.jpg",
  "author": "Kritzolina",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:Timber_in_Tyrol_01.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Timber_in_Tyrol_01.jpg/1280px-Timber_in_Tyrol_01.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Timber_in_Tyrol_01.jpg/500px-Timber_in_Tyrol_01.jpg"
 },
 {
  "id": "log-face-tyrol-3",
  "group": "ends",
  "title": "Timber in Tyrol 03.jpg",
  "author": "Kritzolina",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:Timber_in_Tyrol_03.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Timber_in_Tyrol_03.jpg/1280px-Timber_in_Tyrol_03.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Timber_in_Tyrol_03.jpg/500px-Timber_in_Tyrol_03.jpg"
 },
 {
  "id": "woodpile-texture",
  "group": "ends",
  "title": "Woodpile texture.jpg",
  "author": "www.Pixel.la Free Stock Photos",
  "license": "CC0",
  "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
  "page": "https://commons.wikimedia.org/wiki/File:Woodpile_texture.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Woodpile_texture.jpg/1280px-Woodpile_texture.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Woodpile_texture.jpg/500px-Woodpile_texture.jpg"
 },
 {
  "id": "pine-cross-sections",
  "group": "ends",
  "title": "Pine log cross-sections, Teutendorf, 2016-09-17.jpg",
  "author": "Radomianin",
  "license": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
  "page": "https://commons.wikimedia.org/wiki/File:Pine_log_cross-sections,_Teutendorf,_2016-09-17.jpg",
  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Pine_log_cross-sections%2C_Teutendorf%2C_2016-09-17.jpg/1280px-Pine_log_cross-sections%2C_Teutendorf%2C_2016-09-17.jpg",
  "thumb": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Pine_log_cross-sections%2C_Teutendorf%2C_2016-09-17.jpg/500px-Pine_log_cross-sections%2C_Teutendorf%2C_2016-09-17.jpg"
 }
];
const byGroup=g=>PHOTOS.filter(p=>p.group===g);
/* a photo for a stack, chosen by what the order carries and rotated by the stack's position in its order */
function forStack(order,stack,index){
  const prof=(order&&order.profileId)||'';const unit=(stack&&stack.planned&&stack.planned.unit)||'';const tb=(stack&&stack.timber)||{};
  const group=unit==='ldg'||/kapp|hack/i.test(tb.assortment||'')?'ends':unit==='rm'||/schicht|industrie/i.test(tb.assortment||'')||/waldpflege/.test(prof)?'stacked':'sawlogs';
  const list=byGroup(group);const salt=group==='sawlogs'?(order&&order.id?order.id.charCodeAt(order.id.length-1):0):0;return list[(index+salt)%list.length];
}
function asPhoto(p,extra){return Object.assign({url:p.src,thumb:p.thumb,kind:'site',caption:p.title,credit:{author:p.author,license:p.license,licenseUrl:p.licenseUrl,page:p.page,source:'Wikimedia Commons'}},extra||{});}
const api={PHOTOS,byGroup,forStack,asPhoto};
(globalThis.TransportData=globalThis.TransportData||{}).photos=api;
})();
