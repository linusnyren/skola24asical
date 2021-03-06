const ical = require('ical-generator')
const http = require('http')
const request = require('request');
const moment = require('moment-timezone');
const util = require('util')
const express = require('express')
const async = require('async')

function main() {

  var app = express()
  app.listen(9998)

  app.get('/', (req, res) => {
    res.send('To get schedule for Java19 enter this sites url following /Java19')
  })

  app.get('/Java19', (req, res) => {
    const school = "28c6586e-9183-442c-b1d1-ffbade5483e1"
    const group = "0b10fca0-44fb-4c68-8172-561476f1224b"
    const domain = "goteborg.skola24.se"
    let array = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(x => (x + moment().isoWeek()) % 52).map(x => x == 0 ? 52 : x)

    let weeks = []
    for (let i = 0; i < array.length; i++) {
        if (array[i] >= moment().isoWeek()) {
            weeks.push(array[i])
        }
    }

    counter = weeks.length
    all_events = []

    weeks.map(week => get_events(domain, school, group, week, (events) => {
      all_events = all_events.concat(events)
      counter--
      if (counter == 0) {
        console.log("Sending Schema!")
        res.send(transform_to_ics_events(all_events))
      }
    }))
  })

}


function get_events(domain, school, group, week, callback) {
  const re_weekday = /(Måndag)|(Tisdag)|(Onsdag)|(Torsdag)|(Fredag)/i
  const re_time = /\d*:\d*/i
  const re_text = /\X*/i
  const re_room = /\*/i
  const star = /\*/g
  const multi_space = / +/g
  const body = {
      "divWidth":897,
      "divHeight":550,
      "headerEnabled":false,
      "selectedPeriod":null,
      "selectedWeek":week,
      "selectedTeacher":null,
      "selectedGroup":null,
      "selectedClass":{
          "id":"Java19",
          "guid":"YjkyMmJjMjktNjVmYS1mYjU1LThhYjMtNzA4NDM0NjdmZDM0",
          "isClass":true
    },
        "selectedRoom":null,
        "selectedStudent":null,
        "selectedCourse":null,
        "selectedSubject":null,
        "selectedUnit":{
            "name":"Yrgo Lärdomsgatan",
            "schoolGuid":null,
            "unitGuid":"OWFmNDE4ZTctYjA4Mi1mMzExLWJhMTAtZDkyYTljYzI1Yzll",
            "isTopUnit":false,
            "settings":{
                "activateViewer":true,
                "allowCalendarExport":false
            }
        },
        "selectedSignatures":null,
        "selectedDay":0,
        "domain":domain
    }


  const options = {
    url: 'https://web.skola24.se/timetable/timetable-viewer/data/render',
    headers: {
        "Host": "web.skola24.se",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:68.0) Gecko/20100101 Firefox/68.0",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "sv-SE,sv;q=0.8,en-US;q=0.5,en;q=0.3",
        "Accept-Encoding": "gzip, deflate, br",
        "Content-Type": "application/json",
        "X-Scope": "8a22163c-8662-4535-9050-bc5e1923df48",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Length": 609,
        "Connection": "keep-alive",
        "Referer": "https://web.skola24.se/timetable/timetable-viewer/goteborg.skola24.se/Yrgo%20L%C3%A4rdomsgatan/class/Java19/",
        "Cookie": "ASP.NET_SessionId=4gkqo2ly4omz5rpdtjlmw4hp"
    },
    body: JSON.stringify(body)
  }


  return request.post(options, function(error, response, body) {

    const vertical_match = (rect, list) => list.filter(item => item.x > rect.x1 &&
      item.x < rect.x2)
    const horizontal_match = (rect, list) => list.filter(item => item.y > rect.y1 &&
      item.y < rect.y2)
    const inside = (rect, list) => vertical_match(rect, horizontal_match(rect, list))

    const text = (list) => list.map(item => item.text)
      .join(' ')
      .replace(multi_space, ' ')
      .replace(star, '')

    res = JSON.parse(body)

    weekdays = res.data.textList.filter(e => e.text.match(re_weekday))
    times = res.data.textList.filter(e => e.text.match(re_time))
    texts = res.data.textList.filter(e => e.text.match(re_text) &&
      !e.text.match(re_weekday) &&
      !e.text.match(re_time) && e.text.length > 0)

    titles = texts.filter(e => !e.text.match(re_room))
    rooms = texts.filter(e => e.text.match(re_room))

    times_start = times.filter((e, i) => i % 2 == 0)
    times_end = times.filter((e, i) => i % 2 == 1)
    // If start and end-times are more than start-times, something is fishy
    // Known reasons:
    //      - collisions in schedule
    //
    // Just skip those weeks, for now

    if (times_start.length > times_end.length) {
      return callback([])
    }

    events = times_start
      .map((e, i) => {
        o = {
          x1: e.x,
          y1: e.y,
          x2: times_end[i].x,
          y2: times_end[i].y,
          start: e.text,
          end: times_end[i].text,
          width: times_end[i].x - e.x,
          height: times_end[i].y - e.y
        }
        return o
      })
      .filter(event => event.width > 0 && event.width < 200)
      .map(event => {
        event.title = text(inside(event, titles))
        event.room = text(inside(event, rooms))
        event.day = text(vertical_match(event, weekdays))
        return event
      })

    callback(events)
  })
}

function transform_to_ics_events(events) {
  const re_date = /\d*\/\d*/i
  const year = new Date().getFullYear()
  const fix_timezone = (date) => moment.tz(date, "Europe/Stockholm").clone().tz("Europe/London").toDate()

  ics_events = events.map(e => {
    const date = new String(e.day.match(re_date)).split('/').reverse().map(x => parseInt(x))
    const start = e.start.split(":").map(x => parseInt(x))
    const end = e.end.split(":").map(x => parseInt(x))
    const start_date = fix_timezone([year, date[0] - 1, date[1], start[0], start[1]])
    const end_date = fix_timezone([year, date[0] - 1, date[1], end[0], end[1]])

    event = {
      summary: e.title,
      location: e.room,
      start: start_date,
      end: end_date,
      description: "This service is brought to you by Linus Nyrén, visit his github at the given url",
      url: "https://www.github.com/linusnyren"
    }
    return event
  })
  cal = ical({
    domain: 'example.net',
    timezone: 'Europe/Stockholm'
  })
  cal.events(ics_events)
  return cal.toString()
}

main()
