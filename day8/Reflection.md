# REFLECTION
## The hardest thing
The hardest thing for me in this course was learning to design a system that stays correct when lots of people use it at once. I used to think of an API as just a list of endpoints. It was much harder to ask what happens when two customers go for the same seat, or when a payment request gets sent twice. I got through it by taking it one step at a time: decide which data is the source of truth, use a transaction so related changes happen together, lock the seat rows while checking availability, and add unique constraints as a final safety net. Writing out the TicketHub flow in plain words before drawing the architecture really helped me connect it all.

## Looking at the feedback on my capstone
Looking at the feedback on my capstone, I know what I want to improve. I want the project to be easier to understand and test, so I would make the main user journey clearer, add better validation and error messages, and write notes on how the frontend talks to the API. I would also test the awkward cases, like duplicate requests, failed payments and expired holds, instead of only checking that the happy path works. That would make my work more reliable and easier for another developer to review.

## What will you learn next
Next, I want to learn automated testing and deployment. I plan to practise writing API tests, keep secrets safe with environment variables, and deploy a small app with a database. I also want to learn how to monitor performance, so I can compare how my system really behaves with the estimates I made in my design document.