import type { ProgramDay, Track } from './types';

/** 10-day program per track. Planned-but-unbuilt activities are marked soon: true. */
export const PROGRAM: Record<Track, ProgramDay[]> = {
  ma: [
    { n:1, title:"Medical terms", blurb:"Get your fingers warm and meet the long words you'll type all day.", acts:[
      {type:"sprint"},
      {type:"drill", id:"ma-terms"},
      {type:"test", label:"Day 1 baseline typing test", soon:true} ]},
    { n:2, title:"Vitals", blurb:"Numbers, slashes, and units: build your number-row speed.", acts:[
      {type:"sprint"},
      {type:"drill", id:"ma-vitals"} ]},
    { n:3, title:"Chief complaints", blurb:"Type what patients tell you, the way it goes in the chart.", acts:[
      {type:"sprint"},
      {type:"drill", label:"Chief complaints", soon:true} ]},
    { n:4, title:"SOAP notes I", blurb:"Full Subjective / Objective / Assessment / Plan notes.", acts:[
      {type:"sprint"},
      {type:"drill", id:"ma-soap", label:"SOAP notes I"} ]},
    { n:5, title:"Mid-point check", blurb:"Halfway. See how far you've come since Day 1.", acts:[
      {type:"sprint"},
      {type:"test", label:"Day 5 mid-point typing test", soon:true} ]},
    { n:6, title:"Phone messages & refills", blurb:"Messages for the provider: names, dates, doses, callback details.", acts:[
      {type:"sprint"},
      {type:"drill", id:"ma-phone", label:"Phone messages & refills", passages:[0,2]} ]},
    { n:7, title:"Scheduling", blurb:"Reschedules and appointment details without a single wrong digit.", acts:[
      {type:"sprint"},
      {type:"drill", id:"ma-phone", label:"Scheduling", passages:[1]} ]},
    { n:8, title:"SOAP notes II", blurb:"Second pass at SOAP notes. Beat your Day 4 pace, keep the accuracy.", acts:[
      {type:"sprint"},
      {type:"drill", id:"ma-soap", label:"SOAP notes II"} ]},
    { n:9, title:"Patient instructions", blurb:"Plain-language handouts: lab prep, specimen collection, after-care.", acts:[
      {type:"sprint"},
      {type:"drill", id:"ma-edu"} ]},
    { n:10, title:"Final test", blurb:"Show what 10 days of practice did. Compare against Day 1.", acts:[
      {type:"sprint"},
      {type:"test", label:"Day 10 final typing test", soon:true} ]}
  ],
  rx: [
    { n:1, title:"Pharmacy terms", blurb:"Get your fingers warm and meet the vocabulary of the pharmacy.", acts:[
      {type:"sprint"},
      {type:"drill", label:"Pharmacy terms", soon:true},
      {type:"test", label:"Day 1 baseline typing test", soon:true} ]},
    { n:2, title:"Sig codes: frequencies", blurb:"Daily, BID, TID, every 6 hours: turn shorthand into label directions.", acts:[
      {type:"sprint"},
      {type:"drill", id:"rx-sig", label:"Sig codes: frequencies", passages:[0,1,2,3,4,5,6]} ]},
    { n:3, title:"Sig codes: routes & forms", blurb:"Eyes, ears, inhalers, creams, suppositories, and tapers.", acts:[
      {type:"sprint"},
      {type:"drill", id:"rx-sig", label:"Sig codes: routes & forms", passages:[7,8,9,10,11,12,13]} ]},
    { n:4, title:"Look-alike drugs", blurb:"Tall Man lettering: a Shift-key workout that builds safety habits.", acts:[
      {type:"sprint"},
      {type:"drill", id:"rx-lasa"} ]},
    { n:5, title:"Mid-point check", blurb:"Halfway. See how far you've come since Day 1.", acts:[
      {type:"sprint"},
      {type:"test", label:"Day 5 mid-point typing test", soon:true} ]},
    { n:6, title:"Full prescription labels", blurb:"Multi-line labels: patient, drug, quantity, directions, refills.", acts:[
      {type:"sprint"},
      {type:"drill", id:"rx-labels"} ]},
    { n:7, title:"Do-not-use list & aux labels", blurb:"Abbreviations to avoid, plus standard auxiliary label wording.", acts:[
      {type:"sprint"},
      {type:"drill", id:"rx-safety"} ]},
    { n:8, title:"Insurance & prior auth", blurb:"Claim rejections, refill-too-soon, and prior authorization notes.", acts:[
      {type:"sprint"},
      {type:"drill", id:"rx-workflow", label:"Insurance & prior auth", passages:[0,1]} ]},
    { n:9, title:"Workflow & referrals", blurb:"Inventory notes and handing questions to the pharmacist.", acts:[
      {type:"sprint"},
      {type:"drill", id:"rx-workflow", label:"Workflow & referrals", passages:[2,3]} ]},
    { n:10, title:"Final test", blurb:"Show what 10 days of practice did. Compare against Day 1.", acts:[
      {type:"sprint"},
      {type:"test", label:"Day 10 final typing test", soon:true} ]}
  ]
};
